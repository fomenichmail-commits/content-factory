import { describe, it, expect } from "vitest";
import { fullText } from "../src/content/text.js";
import type { GeneratedPost } from "../src/types.js";

function post(text: string, hashtags = ""): GeneratedPost {
  return { title: "t", text, hashtags, keywords: [] };
}

describe("text: fullText без дублирования хэштегов", () => {
  it("добавляет хэштеги, если их нет в тексте", () => {
    const out = fullText(post("Просто текст.", "#совет #лайфхак"));
    expect(out).toBe("Просто текст.\n\n#совет #лайфхак");
  });

  it("не дублирует хэштеги, которые уже есть в тексте", () => {
    const out = fullText(post("Пост #совет текст", "#совет #лайфхак"));
    expect(out).toContain("Пост #совет текст");
    expect(out).not.toContain("#совет #совет");
    // #лайфхак добавится, #совет нет
    expect(out).toBe("Пост #совет текст\n\n#лайфхак");
  });

  it("возвращает текст как есть, если хэштегов нет", () => {
    const out = fullText(post("Без хэштегов", ""));
    expect(out).toBe("Без хэштегов");
  });

  it("обрезает пробелы по краям", () => {
    const out = fullText(post("  Текст с пробелами  ", "#а"));
    expect(out.startsWith("Текст с пробелами")).toBe(true);
  });

  it("если все хэштеги точно в тексте — ничего не добавляет", () => {
    const out = fullText(post("Пост с #тег внутри", "#тег"));
    expect(out).toBe("Пост с #тег внутри");
  });

  it("хэштег-как-часть-слова (#тегом) не считается совпадением #тег", () => {
    const out = fullText(post("Пост с #тегом внутри", "#тег"));
    // #тег не встречается целиком → добавится. Это текущее поведение (без дублей слова).
    expect(out).toBe("Пост с #тегом внутри\n\n#тег");
  });
});