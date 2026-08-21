import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";
import { fetchWithProxy, hasProxy } from "../utils/proxyFetch.js";

export interface GeneratedImage {
  /** Изображение в base64 (без data: URI префикса) */
  base64: string;
  mimeType: string;
  /** Расширение файла без точки */
  ext: string;
}

/**
 * Генерация изображений для постов через OpenAI Images API (DALL-E 3).
 */
export class ImageGenerator {
  constructor(private config: Config) {}

  async generate(topic: string): Promise<GeneratedImage> {
    const key = this.config.llm.openaiApiKey;
    if (!key) throw new Error("OPENAI_API_KEY не задан для генерации изображений");

    const prompt =
      `Создай привлекательное, современное изображение для поста в соцсетях на тему: "${topic}". ` +
      `Стиль: яркий, чистый, без текста и водяных знаков, вертикальный квадрат 1:1.`;

    logger.info("Генерация изображения через DALL-E", { model: this.config.image.model });

    if (hasProxy()) {
      logger.debug("OpenAI-запрос через прокси", { url: this.config.llm.openaiBaseUrl });
    }

    const res = await fetchWithProxy(`${this.config.llm.openaiBaseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.config.image.model,
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI Images API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { data: { b64_json: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI не вернул изображение");

    logger.info("Изображение сгенерировано");
    return { base64: b64, mimeType: "image/png", ext: "png" };
  }
}