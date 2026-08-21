import "dotenv/config";

export type LlmProvider = "openai" | "anthropic" | "none";
export type ImageStorage = "s3" | "placeholder";

export interface Config {
  // Telegram
  telegram: {
    botToken: string;
    channel: string;
  };
  // Meta
  meta: {
    pageAccessToken: string;
    pageId: string;
    instagramId: string;
  };
  // LLM
  llm: {
    provider: LlmProvider;
    openaiApiKey?: string;
    openaiModel: string;
    /** OpenAI-совместимый базовый URL (прокси/шлюз). По умолчанию https://api.openai.com/v1 */
    openaiBaseUrl: string;
    anthropicApiKey?: string;
    anthropicModel: string;
  };
  // Генерация изображений
  image: {
    enabled: boolean;
    /** Провайдер изображений: "openai" (DALL-E) | "yandex" (YandexART) */
    provider: "openai" | "yandex";
    model: string;
  };
  // Yandex Cloud (YandexART)
  yandex: {
    apiKey?: string;
    keyId?: string;
    folderId?: string;
  };
  // Маскот компании: локальный файл изображения, используемый в постах
  // вместо генерации DALL-E (если задан — приоритет над image.enabled)
  mascot: {
    file?: string;
  };
  // Баннер: маскот + текст поста на картинке (CONTENT_BANNER=on)
  banner: {
    enabled: boolean;
  };
  // Публичное хранилище изображений
  storage: {
    image: ImageStorage;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsRegion?: string;
    s3Bucket?: string;
  };
  // Scheduling
  schedule: {
    timezone: string;
  };
  // Режим ревью: посты сначала в тестовый канал, публикуются после апрува
  review: {
    enabled: boolean;
    channel?: string;
  };
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "" || value.startsWith("your_")) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value.trim();
}

function optional(name: string, value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function loadConfig(): Config {
  const provider = (process.env.CONTENT_LLM_PROVIDER ?? "none") as LlmProvider;

  return {
    telegram: {
      botToken: required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN),
      channel: required("TELEGRAM_CHANNEL", process.env.TELEGRAM_CHANNEL),
    },
    meta: {
      pageAccessToken: required(
        "META_PAGE_ACCESS_TOKEN",
        process.env.META_PAGE_ACCESS_TOKEN
      ),
      pageId: required("META_PAGE_ID", process.env.META_PAGE_ID),
      instagramId: required("META_INSTAGRAM_ID", process.env.META_INSTAGRAM_ID),
    },
    llm: {
      provider,
      openaiApiKey: optional("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
      openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      openaiBaseUrl:
        process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      anthropicApiKey: optional(
        "ANTHROPIC_API_KEY",
        process.env.ANTHROPIC_API_KEY
      ),
      anthropicModel:
        process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
    },
    image: {
      enabled: (process.env.IMAGE_GENERATION ?? "off") === "on",
      provider: (process.env.IMAGE_PROVIDER ?? "openai") as "openai" | "yandex",
      model: process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3",
    },
    yandex: {
      apiKey: optional("YANDEX_API_KEY", process.env.YANDEX_API_KEY),
      keyId: optional("YANDEX_KEY_ID", process.env.YANDEX_KEY_ID),
      folderId: optional("YANDEX_FOLDER_ID", process.env.YANDEX_FOLDER_ID),
    },
    mascot: {
      file: optional("CONTENT_MASCOT_FILE", process.env.CONTENT_MASCOT_FILE),
    },
    banner: {
      enabled: (process.env.CONTENT_BANNER ?? "off") === "on",
    },
    storage: {
      image: (process.env.IMAGE_STORAGE ?? "placeholder") as ImageStorage,
      awsAccessKeyId: optional("AWS_ACCESS_KEY_ID", process.env.AWS_ACCESS_KEY_ID),
      awsSecretAccessKey: optional(
        "AWS_SECRET_ACCESS_KEY",
        process.env.AWS_SECRET_ACCESS_KEY
      ),
      awsRegion: process.env.AWS_REGION ?? "us-east-1",
      s3Bucket: optional("S3_BUCKET", process.env.S3_BUCKET),
    },
    schedule: {
      timezone: process.env.CONTENT_TIMEZONE ?? "Europe/Moscow",
    },
    review: {
      enabled: (process.env.CONTENT_REVIEW_MODE ?? "off") === "on",
      channel: optional("TELEGRAM_REVIEW_CHANNEL", process.env.TELEGRAM_REVIEW_CHANNEL),
    },
  };
}
