import type { Config } from "../config.js";
import type { GeneratedPost, Platform } from "../types.js";
import { fullText } from "../content/text.js";
import { logger } from "../utils/logger.js";

const GRAPH = "https://graph.facebook.com/v19.0";

interface GraphError {
  error?: { message: string; code?: number };
}

/**
 * Публикация в Facebook и Instagram через официальный Meta Graph API.
 * Требуется long-lived page access token (см. README).
 * imageUrl — публичный URL изображения (обязателен для Instagram).
 */
export class MetaPublisher {
  constructor(private config: Config) {}

  private get token(): string {
    const t = this.config.meta.pageAccessToken;
    if (!t) throw new Error("META_PAGE_ACCESS_TOKEN не настроен (Meta не подключена)");
    return t;
  }

  /**
   * Опубликовать пост на указанной платформе.
   * facebook — пост на страницу (feed или photo)
   * instagram — пост в профиль через контейнер (media + media_publish)
   */
  async publish(
    platform: Platform,
    post: GeneratedPost,
    imageUrl?: string
  ): Promise<string> {
    if (platform === "instagram") {
      return this.publishInstagram(post, imageUrl);
    }
    return this.publishFacebook(post, imageUrl);
  }

  private caption(post: GeneratedPost): string {
    return fullText(post);
  }

  private async publishFacebook(
    post: GeneratedPost,
    imageUrl?: string
  ): Promise<string> {
    const pageId = this.config.meta.pageId;
    if (!pageId) throw new Error("META_PAGE_ID не настроен (Meta не подключена)");
    logger.info("Публикация в Facebook", { pageId });

    // Если есть изображение — постим фото (лучше для вовлечённости).
    if (imageUrl) {
      const url = `${GRAPH}/${pageId}/photos?access_token=${encodeURIComponent(this.token)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl, message: this.caption(post) }),
      });
      const data = (await res.json()) as { id?: string; post_id?: string } & GraphError;
      if (!res.ok || (!data.id && !data.post_id)) {
        throw new Error(`Facebook photo error: ${data.error?.message ?? res.status}`);
      }
      const externalId = data.post_id ?? data.id!;
      logger.info("Фото опубликовано в Facebook", { externalId });
      return externalId;
    }

    const url = `${GRAPH}/${pageId}/feed?access_token=${encodeURIComponent(this.token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: this.caption(post) }),
    });
    const data = (await res.json()) as { id?: string } & GraphError;
    if (!res.ok || !data.id) {
      throw new Error(`Facebook API error: ${data.error?.message ?? res.status}`);
    }
    logger.info("Пост опубликован в Facebook", { postId: data.id });
    return data.id;
  }

  private async publishInstagram(
    post: GeneratedPost,
    imageUrl?: string
  ): Promise<string> {
    const igId = this.config.meta.instagramId;
    if (!igId) throw new Error("META_INSTAGRAM_ID не настроен (Meta не подключена)");
    if (!imageUrl) {
      throw new Error(
        "Для Instagram обязателен imageUrl. Включите генерацию изображений (IMAGE_GENERATION=on) и хранилище S3."
      );
    }

    logger.info("Публикация в Instagram (контейнер)", { igId });

    const createRes = await fetch(
      `${GRAPH}/${igId}/media?access_token=${encodeURIComponent(this.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: this.caption(post),
        }),
      }
    );
    const created = (await createRes.json()) as { id?: string } & GraphError;
    if (!createRes.ok || !created.id) {
      throw new Error(
        `Instagram container error: ${created.error?.message ?? createRes.status}`
      );
    }

    const pubRes = await fetch(
      `${GRAPH}/${igId}/media_publish?access_token=${encodeURIComponent(this.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: created.id }),
      }
    );
    const published = (await pubRes.json()) as { id?: string } & GraphError;
    if (!pubRes.ok || !published.id) {
      throw new Error(
        `Instagram publish error: ${published.error?.message ?? pubRes.status}`
      );
    }
    logger.info("Пост опубликован в Instagram", { mediaId: published.id });
    return published.id;
  }
}