import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GeneratedImage } from "./image.js";
import { logger } from "../utils/logger.js";

const WIDTH = 1080;
const HEIGHT = 1080;

/**
 * Собрать баннер для поста: маскот компании + текст темы.
 * Маскот — фон (затемнение), внизу — заголовок поста.
 * Возвращает готовое изображение в base64 (PNG).
 */
export async function makeBanner(
  mascotFile: string,
  text: string
): Promise<GeneratedImage> {
  const mascotPath = resolve(mascotFile);
  const mascot = readFileSync(mascotPath);

  // 1. Фон: маскот, растянутый на весь квадрат, слегка затемнённый
  const base = await sharp(mascot)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${WIDTH}" height="${HEIGHT}">
             <rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(0,0,0,0.45)"/>
           </svg>`
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  // 2. Текст поста (обрезка до ~4 строк, 30 символов в строке)
  const lines = wrapText(text, 28).slice(0, 4);
  const lineHeight = 66;
  const fontSize = 54;
  const startY = HEIGHT - 40 - lines.length * lineHeight;

  const svgText = lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" ` +
        `font-size="${fontSize}" font-weight="bold" fill="#ffffff">${escapeXml(line)}</text>`
    )
    .join("\n");

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
       <rect x="0" y="${startY - 30}" width="${WIDTH}" height="${lines.length * lineHeight + 60}" fill="rgba(0,0,0,0.55)"/>
       ${svgText}
     </svg>`
  );

  const out = await sharp(base).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();

  logger.info("Баннер собран", { lines: lines.length, chars: text.length });
  return { base64: out.toString("base64"), mimeType: "image/png", ext: "png" };
}

/** Разбить текст на строки по максимальной длине (по словам). */
function wrapText(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxLen) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}