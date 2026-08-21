import type { Config } from "../config.js";
import type { GeneratedImage } from "./image.js";
import { fetchWithProxy } from "../utils/proxyFetch.js";
import { logger } from "../utils/logger.js";

const API = "https://llm.api.cloud.yandex.net/foundationModels/v1";
const OPS = "https://llm.api.cloud.yandex.net/operations";

export interface YandexArtOptions {
  aspectRatio?: string;
  /** Эталонное изображение (маскот) для модификации, а не генерации с нуля */
  referenceImage?: { base64: string; mimeType: string };
}

/**
 * Генерация/редактирование изображений через YandexART (Yandex Cloud Foundation Models).
 * Асинхронный API: создаём операцию, поллим статус, получаем base64 картинку.
 * Если передано referenceImage — маскот модифицируется под промт, а не рисуется с нуля.
 */
export class YandexArt {
  constructor(private config: Config) {}

  private get apiKey(): string {
    const k = this.config.yandex.apiKey;
    if (!k) throw new Error("YANDEX_API_KEY не задан");
    return k;
  }

  private get folderId(): string {
    const f = this.config.yandex.folderId;
    if (!f) throw new Error("YANDEX_FOLDER_ID не задан (ID каталога в Яндекс Облаке)");
    return f;
  }

  async generate(topic: string, opts: YandexArtOptions = {}): Promise<GeneratedImage> {
    const isEdit = Boolean(opts.referenceImage);
    const prompt = isEdit
      ? `Сохрани персонажа-маскота с эталонного изображения и помести его в сцену по теме: "${topic}". ` +
        `Сохрани узнаваемость персонажа и фирменный стиль, убери фон, добавь детали по теме. Без текста и подписей.`
      : `Создай привлекательное современное изображение для поста в соцсетях на тему: "${topic}". ` +
        `Яркий, чистый стиль, без текста и водяных знаков.`;
    const aspectRatio = opts.aspectRatio ?? "1:1";
    const [w, h] = aspectRatio.split(":").map((x) => Number(x) || 1);

    const message: Record<string, unknown> = { weight: 1, text: prompt };
    if (opts.referenceImage) {
      message.image = `data:${opts.referenceImage.mimeType};base64,${opts.referenceImage.base64}`;
    }

    logger.info("YandexART: запуск", {
      mode: isEdit ? "edit-mascot" : "generate",
      modelUri: `art://${this.folderId}/yandex-art/latest`,
    });

    const createRes = await fetchWithProxy(`${API}/imageGenerationAsync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${this.apiKey}`,
      },
      body: JSON.stringify({
        modelUri: `art://${this.folderId}/yandex-art/latest`,
        messages: [message],
        generationOptions: { aspectRatio: { widthRatio: String(w), heightRatio: String(h) } },
      }),
    });

    const created = (await createRes.json()) as { id?: string; error?: { message?: string; code?: string } };
    if (!createRes.ok || !created.id) {
      throw new Error(`YandexART create error: ${created.error?.message ?? createRes.status}`);
    }
    const operationId = created.id;

    // Поллинг операции
    const deadline = Date.now() + 180000; // до 3 минут
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));

      const statusRes = await fetchWithProxy(`${OPS}/${operationId}`, {
        headers: { Authorization: `Api-Key ${this.apiKey}` },
      });
      const status = (await statusRes.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: { image?: string };
      };
      if (!statusRes.ok) {
        throw new Error(`YandexART status error: ${status.error?.message ?? statusRes.status}`);
      }
      if (status.done) {
        const b64 = status.response?.image;
        if (!b64) throw new Error("YandexART не вернул изображение");
        logger.info("YandexART: изображение готово", { operationId });
        return { base64: b64, mimeType: "image/jpeg", ext: "jpg" };
      }
      logger.debug("YandexART: операция ещё выполняется", { operationId });
    }

    throw new Error("YandexART: таймаут ожидания генерации");
  }
}