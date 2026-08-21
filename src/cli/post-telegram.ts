import { loadConfig } from "../config.js";
import { ContentGenerator } from "../content/generator.js";
import { resolvePostImage } from "../content/imageSource.js";
import { TelegramPublisher } from "../publish/telegram.js";
import { logger } from "../utils/logger.js";

/**
 * Отдельная публикация в Telegram (с маскотом или DALL-E, если включены).
 * Использование: node dist/cli/post-telegram.js "Тема поста"
 */
async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    logger.error('Укажите тему: node dist/cli/post-telegram.js "Тема поста"');
    process.exit(1);
  }
  const config = loadConfig();
  const generator = new ContentGenerator(config);
  const post = await generator.generate({ topic });

  const { image } = await resolvePostImage(config, topic);

  const publisher = new TelegramPublisher(config);
  const { externalId, views } = await publisher.publish(post, image);
  console.log(`Published to Telegram, message_id=${externalId}${views ? `, views=${views}` : ""}`);
}

main().catch((err) => {
  logger.error("Ошибка публикации в Telegram", err);
  process.exit(1);
});