export type Platform = "instagram" | "facebook" | "telegram";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "review"
  | "approved"
  | "rejected"
  | "published"
  | "failed";

export interface GeneratedPost {
  /** Короткий заголовок/тема поста */
  title: string;
  /** Текст поста для публикации */
  text: string;
  /** Хэштеги (строка, начинается с #) */
  hashtags: string;
  /** Ключевые слова для подбора шаблона */
  keywords: string[];
}

export interface PostRecord extends GeneratedPost {
  id: string;
  platform: Platform;
  status: PostStatus;
  /** ISO-дата, когда пост должен быть опубликован */
  scheduledFor: string;
  publishedAt?: string;
  error?: string;
  /** Внешний ID публикации (tg message_id / fb post_id / ig media_id) */
  externalId?: string;
  /** Публичный URL изображения поста (если было) */
  imageUrl?: string;
  /** Просмотры Telegram, захваченные при публикации */
  views?: number;
  /** Целевые платформы для записей в режиме ревью */
  platforms?: Platform[];
  /** message_id в тестовом (ревью) канале */
  reviewMessageId?: number;
}

/** Шаблон контента для ротации без LLM */
export interface ContentTemplate {
  id: string;
  /** Когда использовать шаблон (ключевые слова темы) */
  keywords: string[];
  /** Текст с плейсхолдерами {title}, {topic} */
  body: string;
}
