import { loadConfig } from "../config.js";
import { logger } from "../utils/logger.js";

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Утилита: по Page Access Token находим ID страницы и связанный Instagram-аккаунт.
 * Использование:
 *   node dist/cli/meta-info.js                          — использовать токен из .env
 *   node dist/cli/meta-info.js EAA...your_token        — использовать переданный токен
 */
async function main(): Promise<void> {
  const token = process.argv[2] ?? loadConfig().meta.pageAccessToken;
  if (!token || token.startsWith("dev_") || token.startsWith("your_")) {
    logger.error("Нет токена. Вставьте Page Access Token аргументом или в .env");
    process.exit(1);
  }

  // Список страниц, доступных токену
  const accountsRes = await fetch(
    `${GRAPH}/me/accounts?access_token=${encodeURIComponent(token)}`
  );
  const accounts = (await accountsRes.json()) as {
    data?: { id: string; name: string; access_token: string }[];
    error?: { message: string };
  };
  if (!accountsRes.ok || !accounts.data) {
    logger.error("Ошибка получения страниц", { error: accounts.error?.message });
    process.exit(1);
  }

  console.log("=== Страницы, доступные токену ===");
  for (const page of accounts.data) {
    console.log(`  ID: ${page.id}  |  Name: ${page.name}`);
  }

  // Для каждой страницы пытаемся найти Instagram-аккаунт
  for (const page of accounts.data) {
    const igRes = await fetch(
      `${GRAPH}/${page.id}/instagram_accounts?fields=id,username&access_token=${encodeURIComponent(token)}`
    );
    const ig = (await igRes.json()) as {
      data?: { id: string; username: string }[];
      error?: { message: string };
    };
    if (ig.data && ig.data.length) {
      for (const acc of ig.data) {
        console.log(`  → Instagram страницы "${page.name}": ID=${acc.id} (@${acc.username})`);
      }
    } else {
      console.log(`  → Instagram страницы "${page.name}": не найден (${ig.error?.message ?? "нет данных"})`);
    }
  }
}

main().catch((err) => {
  logger.error("Ошибка meta-info", err);
  process.exit(1);
});