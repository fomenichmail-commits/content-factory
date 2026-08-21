import { loadConfig } from "../config.js";
import { ContentGenerator } from "../content/generator.js";
import { ImageGenerator } from "../content/image.js";
import { MetaPublisher } from "../publish/meta.js";
import { S3Uploader } from "../storage/uploader.js";
import type { Platform } from "../types.js";
import { logger } from "../utils/logger.js";

/**
 * Отдельная публикация в Meta (Facebook/Instagram).
 * Использование:
 *   node dist/cli/post-meta.js facebook "Тема поста"
 *   node dist/cli/post-meta.js instagram "Тема поста"
 */
async function main(): Promise<void> {
  const platform = process.argv[2] as Platform;
  const topic = process.argv[3];
  if (platform !== "facebook" && platform !== "instagram") {
    logger.error('Укажите платформу: node dist/cli/post-meta.js facebook|instagram "Тема"');
    process.exit(1);
  }
  if (!topic) {
    logger.error("Укажите тему поста");
    process.exit(1);
  }

  const config = loadConfig();
  const generator = new ContentGenerator(config);
  const post = await generator.generate({ topic });

  let imageUrl: string | undefined;
  if (config.image.enabled) {
    try {
      const image = await new ImageGenerator(config).generate(topic);
      if (config.storage.image === "s3" && config.storage.s3Bucket) {
        const uploader = new S3Uploader(config);
        imageUrl = await uploader.upload(
          image,
          `posts/${new Date().toISOString().slice(0, 10)}/${Date.now()}.${image.ext}`
        );
      } else {
        logger.warn("Для Meta нужно S3-хранилище (IMAGE_STORAGE=s3 + S3_BUCKET)");
      }
    } catch (err) {
      logger.warn("Не удалось сгенерировать/загрузить изображение", err);
    }
  }

  const publisher = new MetaPublisher(config);
  const externalId = await publisher.publish(platform, post, imageUrl);
  console.log(`Published to ${platform}, id=${externalId}`);
}

main().catch((err) => {
  logger.error("Ошибка публикации в Meta", err);
  process.exit(1);
});