import { loadConfig } from "./config.js";
import { ContentGenerator } from "./content/generator.js";
import { logger } from "./utils/logger.js";

/**
 * Отдельная команда: сгенерировать пост для темы и вывести в консоль.
 * Использование: node dist/generate.js "Моя тема"
 */
async function main(): Promise<void> {
  const topic = process.argv[2];
  if (!topic) {
    logger.error("Укажите тему: node dist/generate.js \"Тема поста\"");
    process.exit(1);
  }
  const config = loadConfig();
  const generator = new ContentGenerator(config);
  const post = await generator.generate({ topic });
  console.log(JSON.stringify(post, null, 2));
}

main().catch((err) => {
  logger.error("Ошибка генерации", err);
  process.exit(1);
});
