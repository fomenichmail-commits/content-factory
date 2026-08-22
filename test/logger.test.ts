import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../src/utils/logger.js";

describe("utils/logger", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleSpy.mockClear();
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  it("info пишет в console.info с префиксом", () => {
    logger.info("Собщение");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const arg = infoSpy.mock.calls[0][0] as string;
    expect(arg).toContain("Собщение");
    expect(arg).toContain("[info]");
  });

  it("warn пишет в console.warn", () => {
    logger.warn("Warning");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[warn]");
  });

  it("error пишет в console.error", () => {
    logger.error("Error!");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("[error]");
  });

  it("debug пишет в console.log (при уровне по умолчанию info — может быть отфильтрован)", () => {
    // По умолчанию LOG_LEVEL=info, значит debug пропускается
    logger.debug("Debug msg");
    // debug может не вывестись, но не должен бросать
    expect(() => logger.debug("x")).not.toThrow();
  });

  it("сериализует Error в JSON (message + stack)", () => {
    logger.error("Ошибка", new Error("boom"));
    const arg = errorSpy.mock.calls[0][0] as string;
    expect(arg).toContain("boom");
    expect(arg).toContain("message");
  });

  it("добавляет JSON-мету при передаче объекта", () => {
    logger.warn("С метой", { a: 1 });
    const arg = warnSpy.mock.calls[0][0] as string;
    expect(arg).toContain('{"a":1}');
  });
});