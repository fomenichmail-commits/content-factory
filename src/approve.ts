import { loadConfig } from "./config.js";
import { ReviewService } from "./review/service.js";
import { logger } from "./utils/logger.js";

const WATCH_INTERVAL_MS = Number(process.env.APPROVE_POLL_MS ?? 30000);

/**
 * Обработка нажатий кнопок в тестовом канале (апрув/режект).
 *  node dist/approve.js         — один проход (для GitHub Actions cron)
 *  node dist/approve.js --watch — циклический опрос каждые APPROVE_POLL_MS (для локального запуска)
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.review.enabled) {
    logger.info("Режим ревью выключен (CONTENT_REVIEW_MODE=off)");
    process.exit(0);
  }

  const watch = process.argv.includes("--watch");
  const service = new ReviewService(config);

  if (!watch) {
    const { approved, rejected } = await service.processPendingReviews();
    logger.info("Обработка апрувов завершена", { approved, rejected });
    return;
  }

  logger.info("Режим watch: опрос кнопок каждые " + WATCH_INTERVAL_MS + " мс (Ctrl+C для выхода)");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { approved, rejected } = await service.processPendingReviews();
      if (approved || rejected) {
        logger.info("Обработано нажатий", { approved, rejected });
      }
    } catch (err) {
      logger.error("Ошибка обработки апрувов", err);
    }
    await sleep(WATCH_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  logger.error("Ошибка обработки апрувов", err);
  process.exit(1);
});