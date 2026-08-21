import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PostRecord } from "../types.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const STATE_FILE = join(DATA_DIR, "state.json");

interface State {
  posts: PostRecord[];
}

function empty(): State {
  return { posts: [] };
}

function read(): State {
  if (!existsSync(STATE_FILE)) return empty();
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    logger.warn("Не удалось прочитать state.json, начинаю с пустого состояния");
    return empty();
  }
}

function write(state: State): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/** Получить все записи постов. */
export function getPosts(): PostRecord[] {
  return read().posts;
}

/** Найти запись по id. */
export function getPost(id: string): PostRecord | undefined {
  return read().posts.find((p) => p.id === id);
}

/** Добавить новую запись. */
export function addPost(post: PostRecord): void {
  const state = read();
  state.posts.push(post);
  write(state);
}

/** Обновить существующую запись (по id). */
export function updatePost(id: string, patch: Partial<PostRecord>): PostRecord | undefined {
  const state = read();
  const idx = state.posts.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  state.posts[idx] = { ...state.posts[idx], ...patch, id };
  write(state);
  return state.posts[idx];
}

/** Список постов, запланированных на сейчас (для запуска планировщика). */
export function getDuePosts(now: Date): PostRecord[] {
  return read().posts.filter((p) => {
    if (p.status !== "scheduled") return false;
    const due = new Date(p.scheduledFor).getTime();
    // Пост считается «в срок», если его время уже наступило (с запасом на опоздание до 5 минут)
    return due <= now.getTime() + 5 * 60 * 1000;
  });
}
