import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { GeneratedPost, Platform, PostRecord } from "../types.js";
import { addPost, updatePost } from "../utils/store.js";
import { TelegramPublisher } from "./telegram.js";
import { MetaPublisher } from "./meta.js";
import { logger } from "../utils/logger.js";

export interface PublishOptions {
  image?: { base64: string; mimeType: string; ext: string };
  imageUrl?: string;
  scheduledFor?: string;
  /** Ключ слота расписания (для дедупликации пропущенных слотов). */
  slotKey?: string;
}

/**
 * Опубликовать пост на все указанные платформы.
 * Создаёт отдельную запись в state.json для каждой платформы.
 * Возвращает обновлённые записи (published/failed).
 */
export async function publishToPlatforms(
  config: Config,
  post: GeneratedPost,
  platforms: Platform[],
  opts: PublishOptions = {}
): Promise<PostRecord[]> {
  const scheduledFor = opts.scheduledFor ?? new Date().toISOString();
  const telegram = new TelegramPublisher(config);
  const meta = new MetaPublisher(config);
  const results: PostRecord[] = [];

  for (const platform of platforms) {
    const id = randomUUID();
    const record: PostRecord = {
      id,
      platform,
      status: "scheduled",
      scheduledFor,
      ...post,
      imageUrl: opts.imageUrl,
      slotKey: opts.slotKey,
    };
    addPost(record);

    try {
      let externalId: string;
      let views: number | undefined;
      if (platform === "telegram") {
        const r = await telegram.publish(post, opts.image);
        externalId = r.externalId;
        views = r.views;
      } else {
        externalId = await meta.publish(platform, post, opts.imageUrl);
      }
      const updated = updatePost(id, {
        status: "published",
        publishedAt: new Date().toISOString(),
        externalId,
        imageUrl: opts.imageUrl,
        views,
      });
      logger.info(`Опубликовано на ${platform}`, { id, externalId });
      if (updated) results.push(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updatePost(id, { status: "failed", error: message });
      logger.error(`Ошибка публикации на ${platform}`, { id, error: message });
    }
  }

  return results;
}