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
 * Сравнение ведётся по часу и минуте (без секунд).
 */
export function entriesAt(
  schedule: ScheduleFile,
  now: Date
): { entry: ScheduleEntry; topic: string }[] {
  const h = now.getHours();
  const m = now.getMinutes();
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
