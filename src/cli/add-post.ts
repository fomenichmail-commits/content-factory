import { addToPool } from "../content/pool.js";
import { logger } from "../utils/logger.js";

/**
 * Добавить готовый пост в пул (content/pool.json).
 * Использование: node dist/cli/add-post.js "Тема" "Текст поста"
 */
async function main(): Promise<void> {
  const topic = process.argv[2];
  const text = process.argv.slice(3).join(" ");
  if (!topic || !text) {
    logger.error('Укажите тему и текст: node dist/cli/add-post.js "Тема" "Текст поста"');
    process.exit(1);
  }
  addToPool({ topic, text });
  console.log(`Added to pool: "${topic}"`);
}

main();