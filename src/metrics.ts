import { loadConfig } from "./config.js";
import { MetricsCollector } from "./metrics/collector.js";
import { EngagementCollector, addEngagement, getRecentEngagement } from "./metrics/engagement.js";
import { addSnapshot, getLatestSnapshot, getPreviousSnapshot } from "./metrics/store.js";
import { buildReport } from "./metrics/report.js";
import { getPosts } from "./utils/store.js";
import { requestTelegramApi } from "./utils/http.js";
import { logger } from "./utils/logger.js";

/**
 * CLI: собрать метрики (подписчики + вовлечённость по постам), сохранить историю
 * и (опционально) отправить отчёт в Telegram.
 *   node dist/metrics.js            — собрать и сохранить
 *   node dist/metrics.js --report   — собрать + отправить отчёт в канал
 */
async function main(): Promise<void> {
  const sendReport = process.argv.includes("--report");

  const config = loadConfig();
  const collector = new MetricsCollector(config);

  const snapshot = await collector.collect();
  addSnapshot(snapshot);

  // Вовлечённость по опубликованным постам
  const posts = getPosts();
  const engagementCollector = new EngagementCollector(config);
  const records = await engagementCollector.collectForPosts(posts);
  if (records.length) {
    addEngagement(records);
    logger.info("Вовлечённость сохранена", { count: records.length });
  }

  if (sendReport) {
    const latest = getLatestSnapshot();
    const previous = getPreviousSnapshot();
    if (!latest) {
      logger.error("Нет снимков для отчёта");
      process.exit(1);
    }
    const recentEngagement = getRecentEngagement(10);
    const report = buildReport(latest, previous, recentEngagement);
    console.log(report);

    try {
      // Отчёт отправляем в тестовый (ревью) канал, если он задан
      const reportChat = config.telegram.reviewChannel ?? config.telegram.channel;
      const res = await requestTelegramApi(
        config.telegram.botToken,
        "/sendMessage",
        "POST",
        {
          chat_id: reportChat,
          text: `📈 ${report}`,
          parse_mode: "HTML",
        }
      );
      const data = res.body as { ok?: boolean; description?: string };
      if (res.status < 200 || res.status >= 300 || !data.ok) {
        throw new Error(`Отчёт не отправлен: ${data.description ?? res.status}`);
      }
      logger.info("Отчёт отправлен в Telegram", { chat: reportChat });
    } catch (err) {
      logger.warn("Не удалось отправить отчёт в Telegram (метрики уже сохранены)", err);
    }
  } else {
    console.log(`Снимок сохранён: ${snapshot.at}`);
    console.log(JSON.stringify(snapshot.metrics, null, 2));
  }
}

main().catch((err) => {
  logger.error("Ошибка сбора метрик", err);
  process.exit(1);
});