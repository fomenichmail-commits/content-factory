import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
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
 */
export function entriesAt(
  schedule: ScheduleFile,
  now: Date,
  timezone?: string
): { entry: ScheduleEntry; topic: string }[] {
  const tz = schedule.timezone ?? timezone ?? process.env.CONTENT_TIMEZONE;
  const h = getHourInTz(now, tz);
  const m = getMinuteInTz(now, tz);
  const result: { entry: ScheduleEntry; topic: string }[] = [];

  for (const entry of schedule.entries) {
    if (!entry.hours.includes(h) || !entry.minutes.includes(m)) continue;
    const topics = Array.isArray(entry.topic)
      ? entry.topic
      : [entry.topic];
    const topic = topics[(h + m) % topics.length];
    result.push({ entry, topic });
  }
  return result;
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
