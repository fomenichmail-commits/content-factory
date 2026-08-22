import { describe, it, expect } from "vitest";
import { fullText, truncateForCaption, splitCaptionAtParagraph } from "../src/content/text.js";
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

describe("text: truncateForCaption под лимит подписи Telegram", () => {
  it("возвращает текст как есть, если он короче лимита", () => {
    expect(truncateForCaption("короткий пост", 1024)).toBe("короткий пост");
  });

  it("не обрезает текст ровно по границе лимита", () => {
    const t = "а".repeat(1024);
    expect(truncateForCaption(t)).toBe(t);
  });

  it("обрезает длинный текст и добавляет многоточие", () => {
    const t = "а".repeat(1100);
    const out = truncateForCaption(t);
    expect(out.length).toBe(1024);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 1022)).toBe("а".repeat(1022));
  });

  it("убирает хвостовые пробелы/переносы перед многоточием", () => {
    const t = "вот какой-то текст\n\n" + "б".repeat(1020);
    const out = truncateForCaption(t);
    expect(out.length).toBe(1024);
    expect(/\s$/.test(out.slice(0, -1))).toBe(false);
  });

  it("поддерживает кастомный максимум", () => {
    const out = truncateForCaption("длинный текст для короткого лимита", 10);
    expect(out.length).toBe(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("text: splitCaptionAtParagraph разбивает длинный пост", () => {
  const para = (n: string) => `Абзац ${n} длиной в несколько слов для теста разбивки.`;

  it("возвращает текст как есть, если он короче лимита", () => {
    const r = splitCaptionAtParagraph("короткий текст", 1024);
    expect(r.first).toBe("короткий текст");
    expect(r.rest).toBe("");
  });

  it("режет на границе абзаца, не обрывая мысль", () => {
    const t = [para("1"), para("2"), para("3"), para("4"), para("5")].join("\n\n");
    const r = splitCaptionAtParagraph(t, 200);
    expect(r.first.length).toBeLessThanOrEqual(200);
    // первая часть целиком состоит из абзацев (не обрывает середину абзаца)
    expect(r.first.split("\n\n").every((p) => t.split("\n\n").includes(p.trim()))).toBe(true);
    // восстановление из частей равно исходнику
    expect(r.first + (r.rest ? "\n\n" + r.rest : "")).toBe(t);
  });

  it("не теряет данные между частями (конкатенация равна исходнику)", () => {
    const t = Array.from({ length: 8 }, (_, i) => `Параграф номер ${i + 1} с содержимым.`).join("\n\n");
    const r = splitCaptionAtParagraph(t, 120);
    expect(r.first + (r.rest ? "\n\n" + r.rest : "")).toBe(t);
  });

  it("если один огромный абзац — режет по последнему пробелу в лимите", () => {
    const t = "слова ".repeat(500).trim();
    const r = splitCaptionAtParagraph(t, 100);
    expect(r.first.length).toBeLessThanOrEqual(100);
    expect(r.first.endsWith("слова") || r.first.endsWith("слова")).toBe(true);
    expect(r.first).not.toMatch(/\s$/);
  });

  it("пустой rest для текста ровно по границе", () => {
    const t = "а".repeat(1024);
    const r = splitCaptionAtParagraph(t);
    expect(r.first).toBe(t);
    expect(r.rest).toBe("");
  });
});