import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";
import type { PostRecord, Platform } from "../types.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const ENGAGEMENT_FILE = join(DATA_DIR, "engagement.json");

export interface PostEngagement {
  /** Внутренний id поста из state.json */
  postId: string;
  platform: Platform;
  externalId: string;
  title: string;
  /** ISO-дата сбора */
  at: string;
  /** Просмотры (tg views / fb impressions / ig reach) */
  views?: number;
  /** Охват (fb/ig) */
  reach?: number;
  /** Реакции / лайки */
  reactions?: number;
  comments?: number;
  saved?: number;
  engagedUsers?: number;
}

interface EngagementState {
  /** История по postId: последние замеры */
  posts: Record<string, PostEngagement[]>;
}

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Сбор вовлечённости по опубликованным постам:
 *  - Facebook: /{post_id}/insights (показы, реакции, вовлечённые)
 *  - Instagram: /{ig_media_id}/insights (impressions, reach, likes, comments, saved)
 *  - Telegram: просмотры уже захвачены при публикации (Bot API не отдаёт историю)
 */
export class EngagementCollector {
  constructor(private config: Config) {}

  private get token(): string | undefined {
    return this.config.meta.pageAccessToken;
  }

  async collectForPosts(posts: PostRecord[]): Promise<PostEngagement[]> {
    const results: PostEngagement[] = [];

    for (const post of posts) {
      const externalId = post.externalId;
      if (post.status !== "published" || !externalId) continue;

      if (post.platform === "telegram") {
        results.push({
          postId: post.id,
          platform: "telegram",
          externalId,
          title: post.title,
          at: new Date().toISOString(),
          views: post.views,
        });
        continue;
      }

      if (post.platform === "facebook") {
        const e = await this.collectFacebook(post, externalId);
        if (e) results.push(e);
      } else if (post.platform === "instagram") {
        const e = await this.collectInstagram(post, externalId);
        if (e) results.push(e);
      }
    }

    return results;
  }

  private async collectFacebook(
    post: PostRecord,
    externalId: string
  ): Promise<PostEngagement | undefined> {
    const token = this.token;
    if (!token) return undefined;
    try {
      const url =
        `${GRAPH}/${externalId}/insights?period=lifetime&` +
        `metric=post_impressions,post_engaged_users,post_reactions_by_type_total&` +
        `access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        data?: {
          name: string;
          values: { value: number | Record<string, number> }[];
        }[];
        error?: { message: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(`Facebook: ${data.error?.message ?? res.status}`);
      }

      const get = (name: string): number | undefined => {
        const row = data.data!.find((r) => r.name === name);
        const v = row?.values?.[row.values.length - 1]?.value;
        return typeof v === "number" ? v : undefined;
      };

      const reactionsRow = data.data.find(
        (r) => r.name === "post_reactions_by_type_total"
      );
      const lastVal = reactionsRow?.values?.[reactionsRow.values.length - 1]?.value;
      const reactions =
        typeof lastVal === "object" && lastVal !== null
          ? Object.values(lastVal).reduce((a: number, b) => a + b, 0)
          : undefined;

      logger.info("Вовлечённость Facebook собрана", { postId: post.id });
      return {
        postId: post.id,
        platform: "facebook",
        externalId,
        title: post.title,
        at: new Date().toISOString(),
        views: get("post_impressions"),
        reactions,
        engagedUsers: get("post_engaged_users"),
      };
    } catch (err) {
      logger.warn("Не удалось получить вовлечённость Facebook", {
        postId: post.id,
        error: err instanceof Error ? err.message : err,
      });
      return undefined;
    }
  }

  private async collectInstagram(
    post: PostRecord,
    externalId: string
  ): Promise<PostEngagement | undefined> {
    const token = this.token;
    if (!token) return undefined;
    try {
      const url =
        `${GRAPH}/${externalId}/insights?metric=impressions,reach,likes,comments,saved&` +
        `access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        data?: {
          name: string;
          values: { value: number }[];
        }[];
        error?: { message: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(`Instagram: ${data.error?.message ?? res.status}`);
      }

      const get = (name: string): number | undefined => {
        const row = data.data!.find((r) => r.name === name);
        const v = row?.values?.[row.values.length - 1]?.value;
        return typeof v === "number" ? v : undefined;
      };

      logger.info("Вовлечённость Instagram собрана", { postId: post.id });
      return {
        postId: post.id,
        platform: "instagram",
        externalId,
        title: post.title,
        at: new Date().toISOString(),
        reach: get("reach"),
        views: get("impressions"),
        reactions: get("likes"),
        comments: get("comments"),
        saved: get("saved"),
      };
    } catch (err) {
      logger.warn("Не удалось получить вовлечённость Instagram", {
        postId: post.id,
        error: err instanceof Error ? err.message : err,
      });
      return undefined;
    }
  }
}

// ---------------- Хранилище истории вовлечённости ----------------

function read(): EngagementState {
  if (!existsSync(ENGAGEMENT_FILE)) return { posts: {} };
  try {
    return JSON.parse(readFileSync(ENGAGEMENT_FILE, "utf8")) as EngagementState;
  } catch {
    logger.warn("Не удалось прочитать engagement.json, начинаю с пустого");
    return { posts: {} };
  }
}

function write(state: EngagementState): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ENGAGEMENT_FILE, JSON.stringify(state, null, 2), "utf8");
}

/** Добавить замеры вовлечённости в историю (максимум N на пост). */
export function addEngagement(records: PostEngagement[], max = 30): void {
  const state = read();
  for (const r of records) {
    const list = state.posts[r.postId] ?? [];
    list.push(r);
    state.posts[r.postId] = list.slice(list.length - max);
  }
  write(state);
}

/** Последний замер вовлечённости по внутреннему id поста. */
export function getLatestEngagement(
  postId: string
): PostEngagement | undefined {
  const list = read().posts[postId];
  return list?.length ? list[list.length - 1] : undefined;
}

/** Последние N замеров вовлечённости по всем постам. */
export function getRecentEngagement(n = 10): PostEngagement[] {
  const state = read();
  const all = Object.values(state.posts)
    .flatMap((list) => (list.length ? [list[list.length - 1]] : []))
    .sort((a, b) => b.at.localeCompare(a.at));
  return all.slice(0, n);
}