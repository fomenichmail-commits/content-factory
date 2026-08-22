import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// scheduler.ts лежит в корне src/ → компилируется в dist/scheduler.js (один уровень от корня репо).
const ROOT = join(__dirname, "..");
const SCHEDULE_FILE = join(ROOT, "schedule.json");

export interface ScheduleEntry {
  /** Часы публикации (0-23, local time of CONTENT_TIMEZONE) */
  hours: number[];
  /** Минуты публикации (0-59) */
  minutes: number[];
  /** Платформы, на которые публикуем в эти моменты */
  platforms: Platform[];
  /** Тема поста (или список тем для ротации) */
  topic: string | string[];
  /** Доп. контекст для LLM */
  prompt?: string;
}

interface ScheduleFile {
  timezone?: string;
  entries: ScheduleEntry[];
}

function defaultSchedule(): ScheduleFile {
  return {
    entries: [
      {
        hours: [9, 13, 18],
        minutes: [0],
        platforms: ["telegram", "facebook", "instagram"],
        topic: "Тема по умолчанию",
      },
    ],
  };
}

export function loadSchedule(): ScheduleFile {
  if (!existsSync(SCHEDULE_FILE)) return defaultSchedule();
  try {
    const raw = readFileSync(SCHEDULE_FILE, "utf8");
    return JSON.parse(raw) as ScheduleFile;
  } catch {
    return defaultSchedule();
  }
}

export function getSchedulePath(): string {
  return SCHEDULE_FILE;
}

/**
 * Найти записи расписания, которые «наступили» в заданный момент времени.
 * Сравнение ведётся по часу и минуте (без секунд) в часовом поясе расписания.
 * Учитывает окно публикации (windowMinutes): если задано, срабатывает в течение
 * windowMinutes после запланированной минуты — компенсирует задержки cron.
 */
export function entriesAt(
  schedule: ScheduleFile,
  now: Date,
  timezone?: string,
  windowMinutes = 0
): { entry: ScheduleEntry; topic: string }[] {
  const tz = schedule.timezone ?? timezone ?? process.env.CONTENT_TIMEZONE;
  const h = getHourInTz(now, tz);
  const m = getMinuteInTz(now, tz);
  const result: { entry: ScheduleEntry; topic: string }[] = [];

  for (const entry of schedule.entries) {
    if (!entry.hours.includes(h)) continue;
    // Совпадение, если текущая минута либо точная, либо в окне после запланированной
    const minuteMatch = entry.minutes.some((min) => {
      if (min === m) return true;
      if (windowMinutes > 0) {
        const delta = m - min;
        if (delta >= 0 && delta <= windowMinutes) return true;
      }
      return false;
    });
    if (!minuteMatch) continue;
    const topics = Array.isArray(entry.topic)
      ? entry.topic
      : [entry.topic];
    const topic = topics[(h + m) % topics.length];
    result.push({ entry, topic });
  }
  return result;
}

/** Слот расписания, который должен быть обработан сейчас (или уже пропущен). */
export interface DueSlot {
  entry: ScheduleEntry;
  topic: string;
  /** Момент слота (локальное время расписания, конвертировано в UTC). */
  slotAt: Date;
  /** Ключ слота для дедупликации: «дата|платформы|чч:мм» в часовом поясе расписания. */
  slotKey: string;
}

export interface DueOptions {
  /** Публиковать в течение N минут после запланированной минуты (задержки cron). */
  windowMinutes?: number;
  /** Слот, пропущенный дольше этого лимита, не навёрстываем (защита от спама в конце дня). */
  missedMaxMinutes?: number;
  /** Навёрстывать любые пропущенные слоты дня (для ручного запуска). */
  forceMissed?: boolean;
  /** Вернуть false для уже обработанных слотов (по slotKey). */
  isHandled?: (slotKey: string) => boolean;
}

/**
 * Слоты расписания, которые «должны сработать» в указанный момент.
 * В отличие от entriesAt учитывает не только текущую минуту в окне, но и
 * пропущенные слоты: если слот уже наступил и по нему ещё нет записи
 * (isHandled=false), он навёрстывается — компенсирует задержки/пропуски
 * GitHub Actions (очередь за длинными job может сдвинуть запуск на часы).
 */
export function dueSlots(
  schedule: ScheduleFile,
  now: Date,
  timezone?: string,
  opts: DueOptions = {}
): DueSlot[] {
  const tz = schedule.timezone ?? timezone ?? process.env.CONTENT_TIMEZONE;
  const windowMinutes = opts.windowMinutes ?? 0;
  const missedMaxMinutes =
    opts.missedMaxMinutes ?? Number(process.env.MISSED_SLOT_MAX_MIN ?? 180);
  const forceMissed = opts.forceMissed ?? process.env.FORCE_MISSED_POSTS === "1";
  const isHandled = opts.isHandled;
  const { year, month, day } = tzParts(now, tz);
  const localDate = `${year}-${pad(month)}-${pad(day)}`;
  const results: DueSlot[] = [];

  for (const entry of schedule.entries) {
    const topics = Array.isArray(entry.topic) ? entry.topic : [entry.topic];
    for (const h of entry.hours) {
      for (const m of entry.minutes) {
        const slotAt = slotUtc(now, h, m, tz);
        const passedMin = (now.getTime() - slotAt.getTime()) / 60000;
        if (passedMin < 0) continue; // слот ещё не наступил
        const late = passedMin > windowMinutes;
        if (late && !forceMissed && passedMin > missedMaxMinutes) continue;
        const slotKey = `${localDate}|${entry.platforms.join(",")}|${h}:${m}`;
        if (isHandled && isHandled(slotKey)) continue;
        const topic = topics[(h + m) % topics.length];
        results.push({ entry, topic, slotAt, slotKey });
      }
    }
  }
  return results;
}

/** Собрать части даты (год/месяц/день/час/минута) в указанном часовом поясе. */
function tzParts(date: Date, tz?: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  if (tz) options.timeZone = tz;
  const dtf = new Intl.DateTimeFormat("en-US", options);
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
  };
}

/** Смещение времени пояса tz от UTC (в минутах) на момент date. */
function tzOffsetMin(date: Date, tz?: string): number {
  const p = tzParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  const dateMin = new Date(date.getTime());
  dateMin.setSeconds(0, 0);
  return Math.round((asUtc - dateMin.getTime()) / 60000);
}

/** UTC-момент для локального времени hh:mm на дату probe в поясе tz. */
function slotUtc(probe: Date, hour: number, minute: number, tz?: string): Date {
  const local = tzParts(probe, tz);
  const offset = tzOffsetMin(probe, tz);
  const naive = Date.UTC(local.year, local.month - 1, local.day, hour, minute);
  return new Date(naive - offset * 60000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Час в указанном часовом поясе (формат IANA, например "Europe/Moscow"). */
function getHourInTz(date: Date, tz?: string): number {
  if (!tz) return date.getHours();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
  } catch {
    return date.getHours();
  }
}

/** Минута в указанном часовом поясе. */
function getMinuteInTz(date: Date, tz?: string): number {
  if (!tz) return date.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "minute")?.value || 0);
  } catch {
    return date.getMinutes();
  }
}
