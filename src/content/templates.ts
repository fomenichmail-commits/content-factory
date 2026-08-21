export interface ContentTemplate {
  id: string;
  keywords: string[];
  body: string;
}

/**
 * Библиотека шаблонов для ротации контента (используется, когда LLM недоступен
 * или как основа для вариаций). Плейсхолдеры: {topic}, {hashtags}.
 */
export const TEMPLATES: ContentTemplate[] = [
  {
    id: "tips",
    keywords: ["совет", "советы", "howto", "лайфхак", "полезное"],
    body:
      "💡 {topic}\n\nПолезный совет, который сэкономит вам время и нервы. Сохраните, чтобы не потерять, и поделитесь с тем, кому пригодится.\n\n#полезное #советы #лайфхак",
  },
  {
    id: "question",
    keywords: ["вопрос", "опрос", "обсуждение", "мнение"],
    body:
      "❓ {topic}\n\nА как вы решаете этот вопрос? Напишите в комментариях — обсудим вместе. Ваше мнение важно!\n\n#обсуждение #вопрос #комментарии",
  },
  {
    id: "news",
    keywords: ["новость", "анонс", "событие", "обновление"],
    body:
      "📣 {topic}\n\nСвежая новость, которую нельзя пропустить. Делимся деталями и своим взглядом на происходящее.\n\n#новости #анонс",
  },
  {
    id: "motivation",
    keywords: ["мотивация", "вдохновение", "цель", "успех"],
    body:
      "🔥 {topic}\n\nКаждый шаг приближает к цели. Не останавливайтесь — маленькие усилия каждый день дают большой результат.\n\n#мотивация #цели #вдохновение",
  },
  {
    id: "general",
    keywords: [],
    body:
      "✨ {topic}\n\nСегодня хотим поделиться с вами этим. Пишите, что думаете — читаем каждый комментарий.\n\n{hashtags}",
  },
];

/** Выбрать шаблон по ключевым словам. */
export function pickTemplate(keywords: string[]): ContentTemplate {
  for (const kw of keywords) {
    const t = TEMPLATES.find((tmpl) => tmpl.keywords.includes(kw.toLowerCase()));
    if (t) return t;
  }
  return TEMPLATES[TEMPLATES.length - 1];
}

/** Заполнить плейсхолдеры шаблона. */
export function renderTemplate(t: ContentTemplate, topic: string): string {
  return t.body
    .replaceAll("{topic}", topic)
    .replaceAll("{hashtags}", "#" + topic.replace(/\s+/g, "").toLowerCase());
}
