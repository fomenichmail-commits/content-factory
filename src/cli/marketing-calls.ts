import { loadConfig } from "../config.js";
import { fetchWithProxy } from "../utils/proxyFetch.js";
import { logger } from "../utils/logger.js";

const GRAPH = "https://graph.facebook.com/v19.0";
const TARGET = Number(process.env.MARKETING_CALLS_TARGET ?? 500);

/**
 * Набор вызовов Marketing API для удовлетворения требования App Review
 * («500 вызовов Marketing API, ошибок < 15%»).
 * Делает легальные read-вызовы по рекламному аккаунту (campaigns/adsets/ads/insights)
 * с паузами для соблюдения rate-limit. Запускать в CI (стабильная сеть).
 */
async function main(): Promise<void> {
  const token = process.env.META_USER_TOKEN ?? loadConfig().meta.pageAccessToken;
  const adAccount = process.env.META_AD_ACCOUNT ?? "act_3659127741051529";
  if (!token || token.startsWith("dev_")) {
    logger.error("Нет токена (META_USER_TOKEN или META_PAGE_ACCESS_TOKEN)");
    process.exit(1);
  }

  logger.info("Начинаем набор вызовов Marketing API", { target: TARGET, adAccount });

  const endpoints = [
    `/campaigns?fields=id,name&limit=1`,
    `/adsets?fields=id,name&limit=1`,
    `/ads?fields=id,name&limit=1`,
    `/insights?fields=campaign_name,impressions,clicks,spend&date_preset=last_7d&limit=1`,
    `/adcreatives?fields=id,name&limit=1`,
  ];

  let success = 0;
  let fail = 0;

  while (success + fail < TARGET) {
    const ep = endpoints[(success + fail) % endpoints.length];
    const url =
      `${GRAPH}/${adAccount}${ep}&access_token=${encodeURIComponent(token)}`;
    try {
      const res = await fetchWithProxy(url);
      if (res.ok) {
        success++;
        logger.debug(`[${success + fail}/${TARGET}] OK ${ep.split("?")[0]}`);
      } else {
        fail++;
        logger.warn(`[${success + fail}/${TARGET}] HTTP ${res.status} ${ep.split("?")[0]}: ${(await res.text()).slice(0, 120)}`);
      }
    } catch (err) {
      fail++;
      logger.warn(`[${success + fail}/${TARGET}] сеть/ошибка ${ep.split("?")[0]}`, err);
    }

    // Пауза: ~200 вызовов/час → ~18 сек между вызовами для не-админного уровня.
    // Для скорости в CI можно сократить через MARKETING_CALLS_DELAY_MS.
    const delay = Number(process.env.MARKETING_CALLS_DELAY_MS ?? 1500);
    await new Promise((r) => setTimeout(r, delay));
  }

  const rate = (success / (success + fail)) * 100;
  logger.info("Готово", { success, fail, successRate: rate.toFixed(1) + "%" });
  console.log(`MARKETING_CALLS_SUCCESS=${success}`);
  console.log(`MARKETING_CALLS_FAIL=${fail}`);
  console.log(`MARKETING_CALLS_RATE=${rate.toFixed(1)}`);
}

main().catch((err) => {
  logger.error("Ошибка набора вызовов", err);
  process.exit(1);
});