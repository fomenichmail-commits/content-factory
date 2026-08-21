import type { Config } from "../config.js";
import { requestTelegramApi } from "../utils/http.js";
import { logger } from "../utils/logger.js";

export interface PlatformMetrics {
  telegram?: { subscribers: number };
  facebook?: { fans: number; followers?: number };
  instagram?: { followers: number; mediaCount?: number };
}

export interface MetricsSnapshot {
  /** ISO-дата сбора */
  at: string;
  metrics: PlatformMetrics;
}

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Сбор метрик роста каналов:
 *  - Telegram: getChatMemberCount (количество подписчиков)
 *  - Facebook: /{page_id}/insights?metric=page_fans (фаны страницы)
 *  - Instagram: /{ig_id}?fields=followers_count,media_count (подписчики)
 */
export class MetricsCollector {
  constructor(private config: Config) {}

  async collect(): Promise<MetricsSnapshot> {
    const metrics: PlatformMetrics = {};

    await this.collectTelegram(metrics);
    await this.collectFacebook(metrics);
    await this.collectInstagram(metrics);

    const snapshot: MetricsSnapshot = {
      at: new Date().toISOString(),
      metrics,
    };
    logger.info("Метрики собраны", { snapshot });
    return snapshot;
  }

  private async collectTelegram(m: PlatformMetrics): Promise<void> {
    try {
      const res = await requestTelegramApi(
        this.config.telegram.botToken,
        "/getChatMemberCount",
        "POST",
        { chat_id: this.config.telegram.channel }
      );
      const data = res.body as {
        ok?: boolean;
        result?: number;
        description?: string;
      };
      if (res.status < 200 || res.status >= 300 || !data.ok || typeof data.result !== "number") {
        throw new Error(`Telegram: ${data.description ?? res.status}`);
      }
      m.telegram = { subscribers: data.result };
    } catch (err) {
      logger.warn("Не удалось получить метрики Telegram", err);
    }
  }

  private async collectFacebook(m: PlatformMetrics): Promise<void> {
    try {
      const pageId = this.config.meta.pageId;
      const url =
        `${GRAPH}/${pageId}/insights?metric=page_fans&period=day&` +
        `access_token=${encodeURIComponent(this.config.meta.pageAccessToken)}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        data?: { values?: { value: number }[] }[];
        error?: { message: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(`Facebook: ${data.error?.message ?? res.status}`);
      }
      const values = data.data[0]?.values ?? [];
      const fans = values.length ? values[values.length - 1].value : 0;
      m.facebook = { fans };
    } catch (err) {
      logger.warn("Не удалось получить метрики Facebook", err);
    }
  }

  private async collectInstagram(m: PlatformMetrics): Promise<void> {
    try {
      const igId = this.config.meta.instagramId;
      const url =
        `${GRAPH}/${igId}?fields=followers_count,media_count&` +
        `access_token=${encodeURIComponent(this.config.meta.pageAccessToken)}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        followers_count?: number;
        media_count?: number;
        error?: { message: string };
      };
      if (!res.ok || typeof data.followers_count !== "number") {
        throw new Error(`Instagram: ${data.error?.message ?? res.status}`);
      }
      m.instagram = {
        followers: data.followers_count,
        mediaCount: data.media_count,
      };
    } catch (err) {
      logger.warn("Не удалось получить метрики Instagram", err);
    }
  }
}