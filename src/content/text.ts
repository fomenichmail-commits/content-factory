import type { GeneratedPost } from "../types.js";

/**
 * Полный текст поста для публикации: текст + хэштеги.
 * Хэштеги добавляются только если их ещё нет в тексте (избегаем дублирования).
 */
export function fullText(post: GeneratedPost): string {
  const text = post.text.trim();
  if (!post.hashtags) return text;

  const tags = post.hashtags.split(/\s+/).filter(Boolean);
  const inText = new Set(text.match(/#[^\s#]+/g) ?? []);
  const missing = tags.filter((t) => !inText.has(t));

  if (missing.length === 0) return text;
  return text + "\n\n" + missing.join(" ");
}

/**
 * Обрезать текст под лимит подписи (caption) Telegram при отправке фото.
 * Telegram: caption для sendPhoto/sendVideo = до 1024 символов.
 * Если текст короче лимита — возвращается как есть.
 */
export function truncateForCaption(text: string, max = 1024): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const trimmed = cut.replace(/[ \n]+$/, "");
  return trimmed + "…";
}

/**
 * Разбить длинный текст для поста с фото: первая часть отправляется как подпись
 * к фото (лимит caption в Telegram — 1024), вторая — отдельным сообщением.
 * Разрыв делается ПО ГРАНИЦЕ абзаца, чтобы текст не обрывался на середине мысли.
 * Если не влезает ни один абзац — режем по последнему пробелу.
 */
export function splitCaptionAtParagraph(
  text: string,
  max = 1024
): { first: string; rest: string } {
  if (text.length <= max) return { first: text, rest: "" };

  const paras = text.split(/\n\s*\n/);
  let first = "";
  for (const p of paras) {
    const candidate = first ? `${first}\n\n${p}` : p;
    if (candidate.length > max) break;
    first = candidate;
  }

  if (!first) {
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    first = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  }

  return { first, rest: text.slice(first.length).replace(/^\s+/, "") };
}