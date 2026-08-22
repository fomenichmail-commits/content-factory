import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POOL_STATE_FILE = join(ROOT, "data", "pool_state.json");

// Моки сетевых функций
const fetchWithProxyMock = vi.fn();
vi.mock("../src/utils/proxyFetch.js", () => ({
  fetchWithProxy: (...a: unknown[]) => fetchWithProxyMock(...a),
  hasProxy: () => false,
  proxyUrl: () => undefined,
}));

const { ContentGenerator } = await import("../src/content/generator.js");

afterAll(() => {
  if (existsSync(POOL_STATE_FILE)) rmSync(POOL_STATE_FILE, { force: true });
});

function cfgWith(provider: "none" | "openai" | "anthropic" | "yandex", over = {}): any {
  return {
    llm: {
      provider,
      openaiApiKey: "sk-test",
      openaiModel: "gpt-4o-mini",
      openaiBaseUrl: "https://api.openai.com/v1",
      anthropicApiKey: "sk-ant-test",
      anthropicModel: "claude",
      yandexApiKey: "yandex-key",
      yandexFolderId: "b1g-test",
      yandexModel: "yandexgpt-lite",
      ...over,
    },
    schedule: { timezone: "Europe/Moscow" },
  };
}

describe("generator: базовые сценарии", () => {
  beforeEach(() => fetchWithProxyMock.mockReset());

  it("бросает ошибку на пустой теме", async () => {
    const g = new ContentGenerator(cfgWith("none"));
    await expect(g.generate({ topic: "   " })).rejects.toThrow("Тема поста не может быть пустой");
  });

  it("provider=none: берёт из пула", async () => {
    const g = new ContentGenerator(cfgWith("none"));
    const post = await g.generate({ topic: "Совет по интеграциям" });
    expect(post.title).toBeTruthy();
    expect(post.text.length).toBeGreaterThan(0);
  });

  it("provider=openai без key: фоллбэк на пул", async () => {
    const g = new ContentGenerator(cfgWith("openai", { openaiApiKey: undefined }));
    const post = await g.generate({ topic: "Новость" });
    expect(post.text.length).toBeGreaterThan(0);
  });

  it("unknown provider бросает ошибку (внутри generateWithLlm)", async () => {
    const g = new ContentGenerator(cfgWith("openai" as any, { provider: "unknown" }));
    const post = await g.generate({ topic: "тема" });
    // ошибка LLM перехвачена → фоллбэк на пул
    expect(post.text.length).toBeGreaterThan(0);
  });
});

describe("generator: openai flow", () => {
  beforeEach(() => fetchWithProxyMock.mockReset());

  it("возвращает текст от OpenAI", async () => {
    fetchWithProxyMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Сгенерированный текст" } }] }),
    });
    const g = new ContentGenerator(cfgWith("openai"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text).toBe("Сгенерированный текст");
  });

  it("извлекает хэштеги из сгенерированного текста", async () => {
    fetchWithProxyMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Текст поста #тег1 #тег2" } }] }),
    });
    const g = new ContentGenerator(cfgWith("openai"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.hashtags).toContain("#тег1");
  });

  it("при ошибке OpenAI (не ok) фоллбэк на пул", async () => {
    fetchWithProxyMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const g = new ContentGenerator(cfgWith("openai"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text.length).toBeGreaterThan(0);
  });

  it("пустой choices → фоллбэк на пул", async () => {
    fetchWithProxyMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [] }) });
    const g = new ContentGenerator(cfgWith("openai"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text.length).toBeGreaterThan(0);
  });
});

describe("generator: anthropic flow", () => {
  beforeEach(() => {
    fetchWithProxyMock.mockReset();
    (globalThis as any).fetch = vi.fn();
  });

  it("возвращает текст от Anthropic", async () => {
    (globalThis as any).fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: "Текст от Claude" }] }),
    });
    const g = new ContentGenerator(cfgWith("anthropic"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text).toBe("Текст от Claude");
  });

  it("anthropic без ключа → фоллбэк", async () => {
    const g = new ContentGenerator(cfgWith("anthropic", { anthropicApiKey: undefined }));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text.length).toBeGreaterThan(0);
  });
});

describe("generator: yandex flow", () => {
  beforeEach(() => fetchWithProxyMock.mockReset());

  it("возвращает текст от YandexGPT", async () => {
    fetchWithProxyMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Текст от YandexGPT" } }] }),
    });
    const g = new ContentGenerator(cfgWith("yandex"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text).toBe("Текст от YandexGPT");
  });

  it("yandex без ключа → фоллбэк на пул", async () => {
    const g = new ContentGenerator(cfgWith("yandex", { yandexApiKey: undefined }));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text.length).toBeGreaterThan(0);
  });

  it("yandex при ошибке API → фоллбэк на пул", async () => {
    fetchWithProxyMock.mockResolvedValue({ ok: false, status: 400, text: async () => "err" });
    const g = new ContentGenerator(cfgWith("yandex"));
    const post = await g.generate({ topic: "Тема" });
    expect(post.text.length).toBeGreaterThan(0);
  });
});