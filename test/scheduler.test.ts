import { describe, it, expect } from "vitest";
import { entriesAt, dueSlots, loadSchedule, type ScheduleFile } from "../src/scheduler.js";
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

describe("scheduler: dueSlots (навёрстывание пропущенных слотов)", () => {
  it("срабатывает в окне, как entriesAt", () => {
    const now = new Date("2026-08-22T06:05:00Z"); // 09:05 МСК
    const slots = dueSlots(schedule, now, "Europe/Moscow", { windowMinutes: 10 });
    expect(slots.length).toBe(1);
    expect(slots[0].slotKey).toBe("2026-08-22|telegram|9:0");
  });

  it("не срабатывает на будущий слот", () => {
    const now = new Date("2026-08-22T05:00:00Z"); // 08:00 МСК
    expect(dueSlots(schedule, now, "Europe/Moscow", { windowMinutes: 10 }).length).toBe(0);
  });

  it("навёрстывает пропущенный слот (поздний запуск на 2 часа)", () => {
    const now = new Date("2026-08-22T08:00:00Z"); // 11:00 МСК, 9:00 уже прошёл
    const slots = dueSlots(schedule, now, "Europe/Moscow", { windowMinutes: 10 });
    expect(slots.some((s) => s.slotKey.includes("9:0"))).toBe(true);
  });

  it("не навёрстывает слот старше missedMaxMinutes", () => {
    const now = new Date("2026-08-22T18:00:00Z"); // 21:00 МСК — оба слота давно прошли
    const slots = dueSlots(schedule, now, "Europe/Moscow", {
      windowMinutes: 10,
      missedMaxMinutes: 120,
    });
    expect(slots).toEqual([]);
  });

  it("forceMissed пробивает лимит missedMaxMinutes", () => {
    const now = new Date("2026-08-22T18:00:00Z"); // 21:00 МСК
    const slots = dueSlots(schedule, now, "Europe/Moscow", {
      windowMinutes: 10,
      missedMaxMinutes: 120,
      forceMissed: true,
    });
    expect(slots.some((s) => s.slotKey.includes("9:0"))).toBe(true);
  });

  it("пропускает слоты, которые уже обработаны (isHandled)", () => {
    const now = new Date("2026-08-22T08:00:00Z"); // 11:00 МСК
    const slots = dueSlots(schedule, now, "Europe/Moscow", {
      windowMinutes: 10,
      isHandled: (k) => k === "2026-08-22|telegram|9:0",
    });
    expect(slots).toEqual([]);
  });

  it("в 22-й день возвращает утренний слот только один раз (без дублей)", () => {
    const now = new Date("2026-08-22T06:07:00Z"); // 09:07 МСК, в окне
    const slots = dueSlots(schedule, now, "Europe/Moscow", { windowMinutes: 10 });
    expect(slots.filter((s) => s.slotKey.includes("9:0")).length).toBe(1);
  });
});