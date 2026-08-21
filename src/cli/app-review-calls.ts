import { loadConfig } from "../config.js";
import { fetchWithProxy } from "../utils/proxyFetch.js";
import { logger } from "../utils/logger.js";

const GRAPH = "https://graph.facebook.com/v19.0";
const TARGET = Number(process.env.MARKETING_CALLS_TARGET ?? 500);

/**
 * Набор тестовых вызовов API по всем разрешениям, требуемым App Review:
 *  - public_profile (2): /me
 *  - pages_show_list (2): /me/accounts
 *  - pages_read_engagement (1): /{page_id}/feed
 *  - business_management (1): /me/adaccounts
 *  - ads_read (1): /{adaccount}/campaigns
 *  - ads_management (1): /{adaccount}/adsets
 *  - Marketing API (500): read-вызовы по рекламному аккаунту
 */
async function main(): Promise<void> {
  const userToken = process.env.META_USER_TOKEN ?? loadConfig().meta.pageAccessToken;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN ?? userToken;
  const pageId = process.env.META_PAGE_ID;
  const adAccount = process.env.META_AD_ACCOUNT ?? "act_3659127741051529";
  if (!userToken) {
    logger.error("Нет токена");
    process.exit(1);
  }

  let success = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean) => {
    if (cond) { success++; logger.info(`OK  ${label}`); }
    else { fail++; logger.warn(`FAIL ${label}`); }
  };

  const get = async (url: string): Promise<number> => {
    const r = await fetchWithProxy(url);
    if (!r.ok) await r.text();
    return r.status;
  };

  logger.info("=== Базовые разрешения (не-Marketing) ===");

  // public_profile (2)
  for (let i = 0; i < 2; i++) {
    const s = await get(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
    ok(`public_profile #${i + 1}`, s === 200);
  }

  // pages_show_list (2)
  for (let i = 0; i < 2; i++) {
    const s = await get(`${GRAPH}/me/accounts?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
    ok(`pages_show_list #${i + 1}`, s === 200);
  }

  // pages_read_engagement (1)
  if (pageId) {
    const s = await get(`${GRAPH}/${pageId}/feed?fields=id&limit=1&access_token=${encodeURIComponent(pageToken ?? "")}`);
    ok("pages_read_engagement", s === 200);
  } else {
    ok("pages_read_engagement (нет pageId)", false);
  }

  // business_management (1)
  {
    const s = await get(`${GRAPH}/me/adaccounts?fields=id&access_token=${encodeURIComponent(userToken)}`);
    ok("business_management", s === 200);
  }

  // ads_read (1)
  {
    const s = await get(`${GRAPH}/${adAccount}/campaigns?fields=id&limit=1&access_token=${encodeURIComponent(userToken)}`);
    ok("ads_read", s === 200);
  }

  // ads_management (1)
  {
    const s = await get(`${GRAPH}/${adAccount}/adsets?fields=id&limit=1&access_token=${encodeURIComponent(userToken)}`);
    ok("ads_management", s === 200);
  }

  logger.info("=== Marketing API (набор 500) ===");
  const endpoints = [
    `/campaigns?fields=id,name&limit=1`,
    `/adsets?fields=id,name&limit=1`,
    `/ads?fields=id,name&limit=1`,
    `/insights?fields=campaign_name,impressions,clicks,spend&date_preset=last_7d&limit=1`,
    `/adcreatives?fields=id,name&limit=1`,
  ];
  let mk = 0;
  while (mk < TARGET) {
    const ep = endpoints[mk % endpoints.length];
    const s = await get(`${GRAPH}/${adAccount}${ep}&access_token=${encodeURIComponent(userToken)}`);
    if (s === 200) { success++; mk++; }
    else { fail++; logger.warn(`Marketing HTTP ${s} ${ep.split("?")[0]}`); }
    if (mk % 50 === 0) logger.info(`Marketing: ${mk}/${TARGET}`);
    const delay = Number(process.env.MARKETING_CALLS_DELAY_MS ?? 1000);
    await new Promise((r) => setTimeout(r, delay));
  }

  logger.info("=== Итог ===", { success, fail, rate: `${((success / (success + fail)) * 100).toFixed(1)}%` });
  console.log(`CALLS_SUCCESS=${success}`);
  console.log(`CALLS_FAIL=${fail}`);
}

main().catch((err) => {
  logger.error("Ошибка набора вызовов", err);
  process.exit(1);
});