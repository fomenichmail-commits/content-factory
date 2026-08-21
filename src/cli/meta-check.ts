import { logger } from "../utils/logger.js";

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Проверка статуса публикации после публикации приложения:
 *  1. Тестовый пост на страницу Facebook (pages_manage_posts).
 *  2. Чтение постов Instagram (instagram_basic / manage_insights).
 * Использует сохранённые секреты (META_PAGE_ACCESS_TOKEN и др.).
 */
async function main(): Promise<void> {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igId = process.env.META_INSTAGRAM_ID;
  if (!pageToken || !pageId) {
    logger.error("Нужны META_PAGE_ACCESS_TOKEN и META_PAGE_ID");
    process.exit(1);
  }

  // 1. Тестовый пост на страницу
  logger.info("Тест публикации на страницу", { pageId });
  const postRes = await fetch(
    `${GRAPH}/${pageId}/feed?access_token=${encodeURIComponent(pageToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "🧪 Тест после публикации приложения — удалим." }),
    }
  );
  const post = (await postRes.json()) as { id?: string; error?: { message?: string; code?: number } };
  if (postRes.ok && post.id) {
    logger.info("✅ Пост на страницу создан", { postId: post.id });
  } else {
    logger.warn("❌ Пост на страницу не создан", { code: post.error?.code, error: post.error?.message });
  }

  // 2. Чтение постов Instagram
  if (igId) {
    logger.info("Тест чтения постов Instagram", { igId });
    const mediaRes = await fetch(
      `${GRAPH}/${igId}/media?fields=id,caption&limit=2&access_token=${encodeURIComponent(pageToken)}`
    );
    const media = (await mediaRes.json()) as { data?: { id: string }[]; error?: { message?: string; code?: number } };
    if (mediaRes.ok && media.data) {
      logger.info("✅ Посты Instagram читаются", { count: media.data.length });
    } else {
      logger.warn("❌ Посты Instagram не читаются", { code: media.error?.code, error: media.error?.message });
    }
  } else {
    logger.warn("META_INSTAGRAM_ID не задан — пропускаю чтение IG");
  }

  console.log("CHECK_DONE");
}

main().catch((err) => {
  logger.error("Ошибка meta-check", err);
  process.exit(1);
});