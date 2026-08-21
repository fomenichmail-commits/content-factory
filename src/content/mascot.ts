import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { GeneratedImage } from "./image.js";
import { logger } from "../utils/logger.js";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Загрузка изображения маскота компании из локального файла.
 * Используется вместо DALL-E, когда задан CONTENT_MASCOT_FILE.
 */
export function loadMascot(file: string): GeneratedImage {
  const path = resolve(file);
  if (!existsSync(path)) {
    throw new Error(`Файл маскота не найден: ${path}`);
  }
  const ext = extname(path).toLowerCase();
  const mimeType = MIME[ext] ?? "image/jpeg";
  const bytes = readFileSync(path);
  logger.info("Маскот загружен", { path, size: bytes.length });
  return {
    base64: bytes.toString("base64"),
    mimeType,
    ext: (ext.slice(1) || "jpg"),
  };
}