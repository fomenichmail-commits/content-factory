import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratedPost } from "../types.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const POOL_FILE = join(ROOT, "content", "pool.json");
const STATE_DIR = join(__dirname, "..", "..", "data");
const POOL_STATE_FILE = join(STATE_DIR, "pool_state.json");

export interface PoolPost {
  /** Тема/заголовок */
  topic: string;
  /** Готовый текст поста */
  text: string;
  /** Хэштеги (необязательно, если есть в тексте) */
  hashtags?: string;
  /** Доп. ключевые слова для подбора по теме */
  keywords?: string[];
}

interface PoolFile {
  posts: PoolPost[];
}

/**
 * Пул готовых постов. Используется, когда LLM недоступен (или как источник
 * тем для ротации). Позволяет публиковать качественный контент без внешних API —
 * посты заранее готовит человек или агент.
 */
export class ContentPool {
  private posts: PoolPost[] = [];
  private lastIndex = -1;

  constructor() {
    this.load();
    this.loadState();
  }

  private load(): void {
    if (!existsSync(POOL_FILE)) {
      this.posts = [];
      return;
    }
    try {
      const data = JSON.parse(readFileSync(POOL_FILE, "utf8")) as PoolFile;
      this.posts = data.posts ?? [];
    } catch {
      logger.warn("Не удалось прочитать content/pool.json");
      this.posts = [];
    }
  }

  private loadState(): void {
    if (!existsSync(POOL_STATE_FILE)) return;
    try {
      const s = JSON.parse(readFileSync(POOL_STATE_FILE, "utf8")) as {
        lastIndex?: number;
      };
      this.lastIndex = s.lastIndex ?? -1;
    } catch {
      /* ignore */
    }
  }

  private saveState(): void {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(
      POOL_STATE_FILE,
      JSON.stringify({ lastIndex: this.lastIndex }, null, 2),
      "utf8"
    );
  }

  get size(): number {
    return this.posts.length;
  }

  /**
   * Взять следующий пост по кругу (ротация). Если указан topic —
   * пытаемся найти пост по ключевым словам, иначе следующий по очереди.
   */
  pick(topic?: string): PoolPost | undefined {
    if (this.posts.length === 0) return undefined;

    if (topic) {
      const q = topic.toLowerCase();
      const byKeyword = this.posts.find((p) =>
        (p.keywords ?? []).some((k) => q.includes(k.toLowerCase()))
      );
      if (byKeyword) return byKeyword;
    }

    this.lastIndex = (this.lastIndex + 1) % this.posts.length;
    this.saveState();
    return this.posts[this.lastIndex];
  }

  /** Преобразовать в готовый пост для публикации. */
  toGeneratedPost(p: PoolPost): GeneratedPost {
    const text = p.text.trim();
    const hashtags = p.hashtags ?? extractHashtags(text);
    return {
      title: p.topic,
      text,
      hashtags,
      keywords: (p.keywords ?? []).length
        ? p.keywords!
        : p.topic.toLowerCase().split(/\s+/),
    };
  }
}

function extractHashtags(text: string): string {
  const tags = text.match(/#[^\s#]+/g) ?? [];
  return tags.join(" ");
}

// ---------------- Утилиты для CLI (добавление постов) ----------------

/** Добавить пост в пул (content/pool.json). */
export function addToPool(post: PoolPost): PoolPost[] {
  let data: PoolFile;
  if (existsSync(POOL_FILE)) {
    data = JSON.parse(readFileSync(POOL_FILE, "utf8")) as PoolFile;
  } else {
    data = { posts: [] };
  }
  data.posts.push(post);
  if (!existsSync(dirname(POOL_FILE))) {
    mkdirSync(dirname(POOL_FILE), { recursive: true });
  }
  writeFileSync(POOL_FILE, JSON.stringify(data, null, 2), "utf8");
  logger.info("Пост добавлен в пул", { topic: post.topic });
  return data.posts;
}