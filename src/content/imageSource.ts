import type { Config } from "../config.js";
import type { GeneratedImage } from "./image.js";
import { loadMascot } from "./mascot.js";
import { S3Uploader } from "../storage/uploader.js";
import { logger } from "../utils/logger.js";

export interface PostImage {
  /** Изображение в base64 (для Telegram multipart) */
  image?: GeneratedImage;
  /** Публичный URL (для Facebook/Instagram) */
  imageUrl?: string;
}

/**
 * Получить изображение для поста.
 * Приоритет:
 *  1. Баннер: маскот + текст поста (CONTENT_BANNER=on + CONTENT_MASCOT_FILE).
 *  2. API-генерация с эталоном: если включена (IMAGE_GENERATION=on) и задан маскот —
 *     маскот МОДИФИЦИРУЕТСЯ промтом под тему поста (не рисуется новая картинка).
 *  3. Маскот как есть (CONTENT_MASCOT_FILE).
 *  4. Генерация с нуля (DALL-E / YandexART), если включена и маскота нет.
 * Ошибки не роняют пост — возвращаем пустой результат.
 */
export async function resolvePostImage(
  config: Config,
  topic: string
): Promise<PostImage> {
  // 1. Баннер: маскот + текст поста
  if (config.banner.enabled && config.mascot.file) {
    try {
      const { makeBanner } = await import("./banner.js");
      const img = await makeBanner(config.mascot.file, topic);
      return await uploadOrLocal(config, img, `posts/${new Date().toISOString().slice(0, 10)}/${Date.now()}`);
    } catch (err) {
      logger.warn("Не удалось собрать баннер, пробуем маскот/генерацию", err);
    }
  }

  // 2. API-генерация с эталоном (модификация маскота промтом под тему)
  if (config.image.enabled && config.mascot.file && config.image.provider === "yandex") {
    try {
      const mascot = loadMascot(config.mascot.file);
      const { YandexArt } = await import("./yandexArt.js");
      const img = await new YandexArt(config).generate(topic, {
        referenceImage: { base64: mascot.base64, mimeType: mascot.mimeType },
      });
      return await uploadOrLocal(config, img, `posts/${new Date().toISOString().slice(0, 10)}/${Date.now()}`);
    } catch (err) {
      logger.warn("Не удалось модифицировать маскот через YandexART, используем маскот как есть", err);
    }
  }

  // 3. Маскот
  if (config.mascot.file) {
    try {
      const img = loadMascot(config.mascot.file);
      return await uploadOrLocal(config, img, `mascot-${Date.now()}`);
    } catch (err) {
      logger.warn("Не удалось использовать маскот, публикуем без изображения", err);
      return {};
    }
  }

  // 4. Генерация через API (DALL-E или YandexART) с нуля
  if (config.image.enabled) {
    try {
      let img: GeneratedImage;
      if (config.image.provider === "yandex") {
        const { YandexArt } = await import("./yandexArt.js");
        img = await new YandexArt(config).generate(topic);
      } else {
        const { ImageGenerator } = await import("./image.js");
        img = await new ImageGenerator(config).generate(topic);
      }
      return await uploadOrLocal(config, img, `posts/${new Date().toISOString().slice(0, 10)}/${Date.now()}`);
    } catch (err) {
      logger.warn("Не удалось сгенерировать изображение, публикуем без него", err);
      return {};
    }
  }

  return {};
}

/** Загрузить в S3 (если настроено) или вернуть локально для Telegram. */
async function uploadOrLocal(
  config: Config,
  img: GeneratedImage,
  keyBase: string
): Promise<PostImage> {
  if (config.storage.image === "s3" && config.storage.s3Bucket) {
    try {
      const uploader = new S3Uploader(config);
      const imageUrl = await uploader.upload(img, `${keyBase}.${img.ext}`);
      return { image: img, imageUrl };
    } catch (err) {
      logger.warn(
        "S3-хранилище недоступно. Telegram получит фото, Meta — без изображения",
        err
      );
      return { image: img };
    }
  }
  logger.warn(
    "Публичное хранилище не настроено (IMAGE_STORAGE=s3 + S3_BUCKET). Telegram получит фото, Meta — без изображения"
  );
  return { image: img };
}