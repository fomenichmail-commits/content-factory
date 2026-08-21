import { describe, it, expect, beforeEach, vi } from "vitest";
import { MetricsCollector } from "../src/metrics/collector.js";

// Мокаем requestTelegramApi (используется для Telegram)
vi.mock("../src/utils/http.js", () => ({
  requestTelegramApi: vi.fn(async (_t: string, path: string) => {
    if (path.includes("getChatMemberCount")) {
      return { status: 200, body: { ok: true, result: 148 } };
    }
    return { status: 200, body: { ok: true, result: {} } };
  }),
}));

const { requestTelegramApi } = await import("../src/utils/http.js");

function cfg(over = {}): any {
  return {
    telegram: { botToken: "t", channel: "@c" },
    meta: { pageId: "110856478070859", instagramId: "17841450339892582", pageAccessToken: "tok", ...over },
  };
}

describe("metrics/collector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("собирает Telegram подписчиков", async () => {
    const c = new MetricsCollector(cfg());
    const snap = await c.collect();
    expect(snap.metrics.telegram?.subscribers).toBe(148);
  });

  it("собирает Facebook фаны (page_fans)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ values: [{ value: 800 }] }] }),
    });
    const c = new MetricsCollector(cfg());
    const snap = await c.collect();
    expect(snap.metrics.facebook?.fans).toBe(800);
  });

  it("собирает Instagram followers_count", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ followers_count: 320, media_count: 69 }),
    });
    const c = new MetricsCollector(cfg());
    const snap = await c.collect();
    expect(snap.metrics.instagram?.followers).toBe(320);
    expect(snap.metrics.instagram?.mediaCount).toBe(69);
  });

  it("не падает и пропускает Facebook/Instagram без токена", async () => {
    const c = new MetricsCollector(cfg({ pageAccessToken: undefined, pageId: undefined, instagramId: undefined }));
    const snap = await c.collect();
    expect(snap.metrics.facebook).toBeUndefined();
    expect(snap.metrics.instagram).toBeUndefined();
  });

  it("устойчив к ошибкам API (warn, но не роняет)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "boom" } }),
    });
    const c = new MetricsCollector(cfg());
    const snap = await c.collect();
    expect(snap.metrics.facebook).toBeUndefined();
    expect(snap.metrics.instagram).toBeUndefined();
  });

  it("собирает все три платформы сразу", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ values: [{ value: 800 }] }], followers_count: 320, media_count: 69 }),
    });
    const c = new MetricsCollector(cfg());
    const snap = await c.collect();
    expect(snap.metrics.telegram).toBeDefined();
    expect(snap.metrics.facebook).toBeDefined();
    expect(snap.metrics.instagram).toBeDefined();
  });
});