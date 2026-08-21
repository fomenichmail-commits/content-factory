import type { Config } from "../config.js";
import type { GeneratedPost } from "../types.js";
import { ContentPool } from "./pool.js";
import { pickTemplate, renderTemplate } from "./templates.js";
import { logger } from "../utils/logger.js";
import { fetchWithProxy, hasProxy } from "../utils/proxyFetch.js";

export interface GenerateInput {
  /** Тема поста */
  topic: string;
  /** Доп. контекст/инструкции для LLM */
  prompt?: string;
}

/**
 * Генератор контента. Гибридная стратегия:
 *  1. LLM-провайдер (OpenAI/Anthropic), если настроен.
 *  2. Пул готовых постов (content/pool.json) — ротация.
 *  3. Шаблон + ротация.
 */
export class ContentGenerator {
  private pool: ContentPool;

  constructor(private config: Config) {
    this.pool = new ContentPool();
  }

  async generate(input: GenerateInput): Promise<GeneratedPost> {
    const topic = input.topic.trim();
    if (!topic) throw new Error("Тема поста не может быть пустой");

    if (this.config.llm.provider !== "none") {
      try {
        const llmText = await this.generateWithLlm(topic, input.prompt);
        return this.finish(llmText, topic);
      } catch (err) {
        logger.warn("LLM-генерация не удалась, откат на пул/шаблон:", err);
      }
    }

    const fromPool = this.pool.pick(topic);
    if (fromPool) {
      logger.info("Пост взят из пула", { topic: fromPool.topic });
      return this.pool.toGeneratedPost(fromPool);
    }

    const template = pickTemplate([topic]);
    const text = renderTemplate(template, topic);
    return this.finish(text, topic);
  }

  private finish(raw: string, topic: string): GeneratedPost {
    const text = raw.trim();
    const hashtags = extractHashtags(text);
    return {
      title: topic,
      text,
      hashtags,
      keywords: topic.toLowerCase().split(/\s+/),
    };
  }

  private async generateWithLlm(topic: string, prompt?: string): Promise<string> {
    const { provider } = this.config.llm;
    const base =
      prompt ??
      `Напиши пост для соцсетей на тему: "${topic}". ` +
        `Стиль: дружелюбный, живой, без воды. Добавь 3-5 релевантных хэштегов. ` +
        `Не используй markdown-разметку заголовков. Ответ — только текст поста.`;

    if (provider === "openai") {
      return this.openai(base);
    }
    if (provider === "anthropic") {
      return this.anthropic(base);
    }
    throw new Error(`Неизвестный LLM-провайдер: ${provider}`);
  }

  private async openai(prompt: string): Promise<string> {
    const { openaiApiKey, openaiModel, openaiBaseUrl } = this.config.llm;
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY не задан");
    if (hasProxy()) {
      logger.debug("OpenAI-запрос через прокси", { url: openaiBaseUrl });
    }
    const res = await fetchWithProxy(`${openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async anthropic(prompt: string): Promise<string> {
    const { anthropicApiKey, anthropicModel } = this.config.llm;
    if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY не задан");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content: { type: string; text: string }[];
    };
    return data.content?.map((c) => c.text).join("\n") ?? "";
  }
}

function extractHashtags(text: string): string {
  const tags = text.match(/#[^\s#]+/g) ?? [];
  return tags.join(" ");
}
