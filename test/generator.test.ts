import { describe, it, expect, afterAll } from "vitest";
import { ContentGenerator } from "../src/content/generator.js";
import { rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POOL_STATE_FILE = join(ROOT, "data", "pool_state.json");

afterAll(() => {
  if (existsSync(POOL_STATE_FILE)) rmSync(POOL_STATE_FILE, { force: true });
});

function cfgWith(provider: "none" | "openai" | "anthropic"): any {
  return {
    llm: { provider, openaiApiKey: undefined, anthropicApiKey: undefined },
    schedule: { timezone: "Europe/Moscow" },
  };
}

describe("generator: базовые сценарии", () => {
  it("бросает ошибку на пустой теме", async () => {
    const g = new ContentGenerator(cfgWith("none"));
    await expect(g.generate({ topic: "   " })).rejects.toThrow("Тема поста не может быть пустой");
  });

  it("provider=none: генерирует пост из пула (без сети)", async () => {
    const g = new ContentGenerator(cfgWith("none"));
    const post = await g.generate({ topic: "Совет по интеграциям" });
    expect(post.title).toBeTruthy();
    expect(post.text.length).toBeGreaterThan(0);
    expect(Array.isArray(post.keywords)).toBe(true);
  });

  it("provider=openai без ключа: падает LLM и откатывается на пул/шаблон", async () => {
    const g = new ContentGenerator(cfgWith("openai"));
    const post = await g.generate({ topic: "Новость про страхование" });
    expect(post.text.length).toBeGreaterThan(0);
  });

  it("возвращает хэштеги в поле hashtags", async () => {
    const g = new ContentGenerator(cfgWith("none"));
    const post = await g.generate({ topic: "Мотивация на день" });
    expect(typeof post.hashtags).toBe("string");
  });
});