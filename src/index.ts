import { loadConfig } from "./config.js";
import { ContentGenerator } from "./content/generator.js";
import { resolvePostImage } from "./content/imageSource.js";
import { loadSchedule, dueSlots } from "./scheduler.js";
import { publishToPlatforms } from "./publish/pipeline.js";
import { getPosts } from "./utils/store.js";
import { ReviewService } from "./review/service.js";
import type { Platform, PostRecord } from "./types.js";
import { logger } from "./utils/logger.js";

/**
 * Основной пайплайн фабрики контента.
 * Запускается по расписанию (GitHub Actions cron / локально).
 *
 * Режимы:
 *  - Без ревью: пост генерируется и сразу публикуется на все платформы.
 *  - С ревью (CONTENT_REVIEW_MODE=on): пост публикуется в тестовый канал
 *    с кнопками одобрения; в основной канал попадает после апрува (approve.js).
 */
export async function runPipeline(now = new Date()): Promise<PostRecord[]> {
  const config = loadConfig();
  const schedule = loadSchedule();
  const window = Number(process.env.PUBLICATION_WINDOW_MIN ?? 10);
  const handled = new Set(
    getPosts()
      .map((p) => p.slotKey)
      .filter((k): k is string => Boolean(k))
  );
  const matches = dueSlots(schedule, now, config.schedule.timezone, {
    windowMinutes: window,
    isHandled: (k) => handled.has(k),
  });

  if (matches.length === 0) {
    logger.info("Сейчас нет запланированных публикаций");
    return [];
  }

  if (config.review.enabled) {
    return runWithReview(config, matches);
  }

  return runDirect(config, matches, now);
}

async function runDirect(
  config: ReturnType<typeof loadConfig>,
  matches: { topic: string; slotKey?: string; entry: { platforms: Platform[]; prompt?: string } }[],
  now: Date
): Promise<PostRecord[]> {
  const generator = new ContentGenerator(config);
  const results: PostRecord[] = [];

  for (const { entry, topic, slotKey } of matches) {
    const post = await generator.generate({ topic, prompt: entry.prompt });

    const { image, imageUrl } = await resolvePostImage(config, topic);

    const published = await publishToPlatforms(config, post, entry.platforms, {
      image,
      imageUrl,
      scheduledFor: now.toISOString(),
      slotKey,
    });
    results.push(...published);
  }

  return results;
}

async function runWithReview(
  config: ReturnType<typeof loadConfig>,
  matches: { topic: string; slotKey?: string; entry: { platforms: Platform[]; prompt?: string } }[]
): Promise<PostRecord[]> {
  const generator = new ContentGenerator(config);
  const review = new ReviewService(config);
  const records: PostRecord[] = [];

  for (const { entry, topic, slotKey } of matches) {
    const post = await generator.generate({ topic, prompt: entry.prompt });
    const recordId = await review.publishForReview(post, entry.platforms, new Date().toISOString(), slotKey);
    const { getPost } = await import("./utils/store.js");
    const r = getPost(recordId);
    if (r) records.push(r);
  }

  return records;
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  runPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Сбой пайплайна", err);
      process.exit(1);
    });
}