import type { Config } from "../config.js";
import type { GeneratedPost } from "../types.js";
import type { GeneratedImage } from "../content/image.js";
import { fullText } from "../content/text.js";
import { requestTelegramApi } from "../utils/http.js";
import { logger } from "../utils/logger.js";

/**
 * Публикация в Telegram через официальный Bot API.
 * Бот должен быть администратором канала (см. README).
 * Поддерживает текст и фото (sendPhoto с multipart-загрузкой).
 */
export class TelegramPublisher {
  constructor(private config: Config) {}

  private get token(): string {
    return this.config.telegram.botToken;
  }

  /**
   * Отправить пост в канал. Возвращает external message_id и просмотры.
   * Если передано изображение — публикуется как фото с подписью.
   */
  async publish(
    post: GeneratedPost,
    image?: GeneratedImage
  ): Promise<{ externalId: string; views?: number }> {
    const text = fullText(post);

    if (image) {
      return this.publishPhoto(text, image);
    }
    return this.publishText(text);
  }

  private async publishText(text: string): Promise<{ externalId: string; views?: number }> {
    logger.info("Отправка поста в Telegram", {
      channel: this.config.telegram.channel,
    });

    const res = await requestTelegramApi(this.token, "/sendMessage", "POST", {
      chat_id: this.config.telegram.channel,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });

    return this.handleResult(res, "Пост опубликован в Telegram");
  }

  private async publishPhoto(
    text: string,
    image: GeneratedImage
  ): Promise<{ externalId: string; views?: number }> {
    logger.info("Отправка фото в Telegram", {
      channel: this.config.telegram.channel,
    });

    // Для фото нужен multipart-запрос — используем fetch (Node 18+).
    // В стандартной сети fetch резолвит api.telegram.org сам; при блокировке
    // DNS используйте TELEGRAM_API_IPS + локальный прокси/правила.
    const bytes = Buffer.from(image.base64, "base64");
    const form = new FormData();
    form.append("chat_id", String(this.config.telegram.channel));
    form.append(
      "photo",
      new Blob([new Uint8Array(bytes)], { type: image.mimeType }),
      `post.${image.ext}`
    );
    form.append("caption", text);

    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    return this.handleResult(
      { status: res.status, body: await res.json() },
      "Фото опубликовано в Telegram"
    );
  }

  private async handleResult(
    res: { status: number; body: unknown },
    successMsg: string
  ): Promise<{ externalId: string; views?: number }> {
    const data = res.body as {
      ok?: boolean;
      result?: { message_id: number; views?: number };
      description?: string;
    };

    if (res.status < 200 || res.status >= 300 || !data.ok) {
      throw new Error(`Telegram API error: ${data.description ?? res.status}`);
    }

    const result = data.result!;
    logger.info(successMsg, { messageId: result.message_id, views: result.views });
    return { externalId: String(result.message_id), views: result.views };
  }
}