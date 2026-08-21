import { describe, it, expect } from "vitest";
import { pickTemplate, renderTemplate, TEMPLATES } from "../src/content/templates.js";

describe("templates: выбор по ключевым словам", () => {
  it("выбирает шаблон 'tips' по слову 'совет'", () => {
    expect(pickTemplate(["совет"]).id).toBe("tips");
  });

  it("выбирает 'question' по слову 'вопрос'", () => {
    expect(pickTemplate(["вопрос"]).id).toBe("question");
  });

  it("выбирает 'news' по слову 'новость'", () => {
    expect(pickTemplate(["новость"]).id).toBe("news");
  });

  it("выбирает 'motivation' по слову 'мотивация'", () => {
    expect(pickTemplate(["мотивация"]).id).toBe("motivation");
  });

  it("fallback на 'general' при отсутствии совпадений", () => {
    expect(pickTemplate(["zzzqqq"]).id).toBe("general");
  });

  it("регистронезависимый поиск", () => {
    expect(pickTemplate(["СОВЕТ"]).id).toBe("tips");
  });

  it("если одно из слов совпадает — берём первый матч", () => {
    const t = pickTemplate(["нечто", "лайфхак"]);
    expect(t.id).toBe("tips");
  });
});

describe("templates: подстановка плейсхолдеров", () => {
  it("подставляет {topic}", () => {
    const t = TEMPLATES.find((x) => x.id === "general")!;
    const out = renderTemplate(t, "Как выстроить интеграции");
    expect(out).toContain("Как выстроить интеграции");
  });

  it("подставляет {hashtags} без пробелов", () => {
    const t = TEMPLATES.find((x) => x.id === "general")!;
    const out = renderTemplate(t, "Надёжные интеграции");
    expect(out).toContain("#надёжныеинтеграции");
  });

  it("сохраняет эмодзи и хэштеги из шаблона", () => {
    const t = TEMPLATES.find((x) => x.id === "tips")!;
    const out = renderTemplate(t, "Совет дня");
    expect(out).toContain("💡");
    expect(out).toContain("#советы");
  });
});