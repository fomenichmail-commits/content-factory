import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const OUTPUT = join(DATA_DIR, "meta.json");

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Автонастройка Meta:
 *  1. Обмен короткого токена на долгоживущий (через app id + secret).
 *  2. Поиск страниц (/me/accounts) → page id + долгоживущий page token.
 *  3. Поиск Instagram-аккаунта (/page_id/instagram_accounts).
 *  4. Тестовая публикация на страницу.
 *
 * Переменные окружения:
 *   META_APP_ID, META_APP_SECRET, META_SHORT_TOKEN (короткий токен из Explorer)
 */
async function main(): Promise<void> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const short = process.env.META_SHORT_TOKEN;
  if (!appId || !appSecret || !short) {
    logger.error("Нужны META_APP_ID, META_APP_SECRET, META_SHORT_TOKEN");
    process.exit(1);
  }

  logger.info("Шаг 1: обмен короткого токена на долгоживущий");
  const ex = await fetchJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(short)}`
  );
  const userToken = ex.access_token;
  if (!userToken) {
    logger.error("Не удалось обменять токен", { error: ex.error?.message });
    process.exit(1);
  }
  logger.info("Долгоживущий user-токен получен (истекает ~60 дней)");

  // Диагностика: какие права реально есть у токена
  const debug = await fetchJson(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(userToken)}` +
      `&access_token=${encodeURIComponent(appId + "|" + appSecret)}`
  );
  const granted = (debug?.data?.scopes as string[]) ?? [];
  logger.info("Права токена", { granted });

  logger.info("Шаг 2: поиск страниц");
  const accounts = await fetchJson(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`
  );
  if (!accounts.data?.length) {
    logger.error("Нет доступных страниц", { error: accounts.error?.message });
    process.exit(1);
  }

  let result: {
    pageId: string;
    pageName: string;
    pageToken: string;
    instagramId?: string;
    instagramUsername?: string;
    userToken: string;
    userTokenExpires: number;
  } | null = null;

  for (const page of accounts.data) {
    logger.info(`Страница: ${page.name} (${page.id})`);
    const igRaw = await fetchJson(
      `${GRAPH}/${page.id}/instagram_accounts?fields=id,username&access_token=${encodeURIComponent(userToken)}`
    );
    // Диагностика: если IG не найден, показываем точную ошибку API
    if (!igRaw.data?.length && igRaw.error) {
      logger.warn("Instagram недоступен для страницы", {
        pageId: page.id,
        error: igRaw.error.message,
        code: igRaw.error.code,
      });
    }
    const ig = igRaw;
    if (result === null || (ig.data?.length && !result.instagramId)) {
      result = {
        pageId: page.id,
        pageName: page.name,
        pageToken: page.access_token,
        instagramId: ig.data?.[0]?.id,
        instagramUsername: ig.data?.[0]?.username,
        userToken,
        userTokenExpires: ex.expires_in ?? 0,
      };
      if (ig.data?.length) {
        logger.info(`  Instagram: ${ig.data[0].id} (@${ig.data[0].username})`);
      }
    }
  }

  if (!result) {
    logger.error("Не удалось выбрать страницу");
    process.exit(1);
  }

  logger.info(`Шаг 3: тестовая публикация на страницу "${result.pageName}"`);
  const test = await fetchJson(
    `${GRAPH}/${result.pageId}/feed?access_token=${encodeURIComponent(result.pageToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "🔧 Тест интеграции Content Factory — это сообщение удалим." }),
    }
  );
  if (!test.id) {
    logger.error("Тестовая публикация не удалась", { error: test.error?.message });
  } else {
    logger.info("Тестовая публикация создана", { postId: test.id });
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");
  console.log(`Результат сохранён в ${OUTPUT}`);
  console.log("META_PAGE_ACCESS_TOKEN=" + result.pageToken);
  console.log("META_PAGE_ID=" + result.pageId);
  console.log("META_INSTAGRAM_ID=" + (result.instagramId ?? "не найден"));
}

async function fetchJson(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<any> {
  const res = await fetch(url, init);
  return res.json();
}

main().catch((err) => {
  logger.error("Ошибка meta-setup", err);
  process.exit(1);
});