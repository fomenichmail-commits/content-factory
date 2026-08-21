import { describe, it, expect } from "vitest";
import { buildReport } from "../src/metrics/report.js";
import type { MetricsSnapshot } from "../src/metrics/collector.js";
import type { PostEngagement } from "../src/metrics/engagement.js";

function snap(at: string, over: Partial<Parameters<typeof buildReport>[0]["metrics"]> = {}): MetricsSnapshot {
  return { at, metrics: { telegram: { subscribers: 1500 }, ...over } };
}

describe("report: buildReport", () => {
  it("содержит все платформы с динамикой", () => {
    const report = buildReport(
      snap("2026-08-21T09:00:00Z", {
        facebook: { fans: 800 },
        instagram: { followers: 320, mediaCount: 69 },
      }),
      snap("2026-08-20T09:00:00Z", {
        facebook: { fans: 790 },
        instagram: { followers: 300, mediaCount: 68 },
      })
    );
    expect(report).toContain("Telegram");
    expect(report).toContain("Facebook");
    expect(report).toContain("Instagram");
    expect(report).toContain("+20"); // растущие метрики
    expect(report).toContain("1.3%"); // 10/790
  });

  it("форматирует динамику роста (+N, %)", () => {
    const prev = snap("2026-08-20T09:00:00Z", { instagram: { followers: 300 } });
    const latest = snap("2026-08-21T09:00:00Z", { instagram: { followers: 320 } });
    const report = buildReport(latest, prev);
    expect(report).toContain("+20");
    expect(report).toContain("6.7%"); // 20/300 = 6.67
  });

  it("показывает '(без изменений)' при нулевой динамике", () => {
    const prev = snap("2026-08-20T09:00:00Z", { telegram: { subscribers: 1500 } });
    const latest = snap("2026-08-21T09:00:00Z", { telegram: { subscribers: 1500 } });
    const report = buildReport(latest, prev);
    expect(report).toContain("без изменений");
  });

  it("показывает '(новое)' если нет предыдущего значения", () => {
    const latest = snap("2026-08-21T09:00:00Z", { telegram: { subscribers: 1500 } });
    const report = buildReport(latest);
    expect(report).toContain("новое");
  });

  it("выводит сообщение, если нет метрик ни по одной платформе", () => {
    const report = buildReport({ at: "2026-08-21T09:00:00Z", metrics: {} });
    expect(report).toContain("Не удалось собрать метрики");
  });

  it("включает блок вовлечённости по постам", () => {
    const eng: PostEngagement[] = [
      { postId: "1", platform: "telegram", externalId: "x", title: "Утренний совет", at: "", views: 123 },
      { postId: "2", platform: "instagram", externalId: "y", title: "Пост", at: "", views: 999, reactions: 12, comments: 3, reach: 500 },
    ];
    const report = buildReport(snap("2026-08-21T09:00:00Z"), undefined, eng);
    expect(report).toContain("Вовлечённость по постам");
    expect(report).toContain("[TG]");
    expect(report).toContain("123 просмотров");
  });

  it("обрезает длинные заголовки в строке вовлечённости", () => {
    const eng: PostEngagement[] = [
      { postId: "1", platform: "facebook", externalId: "x", title: "Очень длинный заголовок поста который надо обрезать до 40 символов", at: "", views: 1 },
    ];
    const report = buildReport(snap("2026-08-21T09:00:00Z"), undefined, eng);
    expect(report).toContain("…");
  });

  it("показывает 'нет данных' для пустой вовлечённости", () => {
    const eng: PostEngagement[] = [
      { postId: "1", platform: "telegram", externalId: "x", title: "Пост", at: "" },
    ];
    const report = buildReport(snap("2026-08-21T09:00:00Z"), undefined, eng);
    expect(report).toContain("нет данных");
  });
});