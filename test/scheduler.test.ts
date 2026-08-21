import { describe, it, expect } from "vitest";
import { entriesAt, loadSchedule, type ScheduleFile } from "../src/scheduler.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const schedule: ScheduleFile = JSON.parse(
  readFileSync(join(ROOT, "schedule.json"), "utf8")
);

describe("scheduler: час и минута в часовом поясе", () => {
  it("находит пост в 09:00 МСК (06:00 UTC)", () => {
    const now = new Date("2026-08-22T06:00:00Z");
    const matches = entriesAt(schedule, now, "Europe/Moscow");
    expect(matches.length).toBe(1);
    expect(matches[0].entry.hours).toContain(9);
  });

  it("находит пост в 18:00 МСК (15:00 UTC)", () => {
    const now = new Date("2026-08-22T15:00:00Z");
    const matches = entriesAt(schedule, now, "Europe/Moscow");
    expect(matches.length).toBe(1);
    expect(matches[0].entry.hours).toContain(18);
  });

  it("НЕ срабатывает в 12:00 МСК (09:00 UTC) — вне расписания", () => {
    const now = new Date("2026-08-22T09:00:00Z");
    const matches = entriesAt(schedule, now, "Europe/Moscow");
    expect(matches.length).toBe(0);
  });

  it("в UTC-окружении, но tz=Europe/Moscow: 15:00Z соответствует 18:00 МСК", () => {
    const now = new Date("2026-08-22T15:00:00Z");
    const asMsk = entriesAt(schedule, now, "Europe/Moscow");
    expect(asMsk.length).toBe(1);
  });
});

describe("scheduler: окно публикации (задержки cron)", () => {
  it("ловит 09:05 МСК с окном 10 мин", () => {
    const now = new Date("2026-08-22T06:05:00Z");
    const matches = entriesAt(schedule, now, "Europe/Moscow", 10);
    expect(matches.length).toBe(1);
  });

  it("ловит 09:09 МСК с окном 10 мин", () => {
    const now = new Date("2026-08-22T06:09:00Z");
    expect(entriesAt(schedule, now, "Europe/Moscow", 10).length).toBe(1);
  });

  it("НЕ ловит 09:11 МСК с окном 10 мин (за пределами окна)", () => {
    const now = new Date("2026-08-22T06:11:00Z");
    expect(entriesAt(schedule, now, "Europe/Moscow", 10).length).toBe(0);
  });

  it("с окном 0 срабатывает только точно в минуту", () => {
    const now = new Date("2026-08-22T06:05:00Z");
    expect(entriesAt(schedule, now, "Europe/Moscow", 0).length).toBe(0);
  });
});

describe("scheduler: loadSchedule деградирует корректно", () => {
  it("возвращает массив entries", () => {
    const s = loadSchedule();
    expect(Array.isArray(s.entries)).toBe(true);
    expect(s.entries.length).toBeGreaterThan(0);
  });
});