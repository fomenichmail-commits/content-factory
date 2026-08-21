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