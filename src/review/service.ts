import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { GeneratedPost, Platform, PostRecord } from "../types.js";
import { fullText } from "../content/text.js";
import { resolvePostImage } from "../content/imageSource.js";
import { requestTelegramApi, requestTelegramApiRaw, type JsonResponse } from "../utils/http.js";
import { buildMultipart } from "../utils/multipart.js";
import { addPost, getPost, updatePost } from "../utils/store.js";
import { publishToPlatforms } from "../publish/pipeline.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const OFFSET_FILE = join(DATA_DIR, "review_offset.json");

const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: "TG",
  facebook: "FB",
  instagram: "IG",
};

/**
 * Режим ревью: сгенерированный пост публикуется в тестовый канал с кнопками
 * «Одобрить / Отклонить». После апрува бот публикует его в основной канал
 * (и на остальные настроенные платформы).
 */
export class ReviewService {
  constructor(private config: Config) {}

  private get token(): string {
    return this.config.telegram.botToken;
  }

  private get reviewChannel(): string {
    const ch = this.config.review.channel;
    if (!ch) throw new Error("TELEGRAM_REVIEW_CHANNEL не задан (режим ревью включён)");
    return ch;
  }

  /** Опубликовать пост в тестовый канал с кнопками апрува. Возвращает recordId. */
  async publishForReview(
    post: GeneratedPost,
    platforms: Platform[],
    scheduledFor = new Date().toISOString(),
    slotKey?: string
  ): Promise<string> {
    const recordId = randomUUID();
    const text =
      `🕐 Новый пост на проверку\n` +
      `─────────────\n` +
      fullText(post) +
      `\n─────────────\n` +
      `🌐 Платформы: ${platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}`;

    const replyMarkup = JSON.stringify({
      inline_keyboard: [
        [
          { text: "✅ Одобрить", callback_data: `approve:${recordId}` },
          { text: "❌ Отклонить", callback_data: `reject:${recordId}` },
        ],
      ],
    });

    // Показываем баннер (маскот + текст) прямо на этапе проверки.
    const { image, imageUrl } = await resolvePostImage(this.config, post.title);

    let res: JsonResponse;
    if (image) {
      const mp = buildMultipart(
        {
          chat_id: String(this.reviewChannel),
          caption: text,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        },
        {
          name: "photo",
          filename: `review_${recordId.slice(0, 8)}.${image.ext}`,
          mimeType: image.mimeType,
          data: Buffer.from(image.base64, "base64"),
        }
      );
      res = await requestTelegramApiRaw(
        this.token,
        "/sendPhoto",
        "POST",
        mp.buffer,
        mp.contentType
      );
    } else {
      res = await requestTelegramApi(this.token, "/sendMessage", "POST", {
        chat_id: this.reviewChannel,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Одобрить", callback_data: `approve:${recordId}` },
              { text: "❌ Отклонить", callback_data: `reject:${recordId}` },
            ],
          ],
        },
      });
    }

    const data = res.body as {
      ok?: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (res.status < 200 || res.status >= 300 || !data.ok || !data.result) {
      throw new Error(`Ревью-публикация не удалась: ${data.description ?? res.status}`);
    }

    const record: PostRecord = {
      id: recordId,
      platform: "telegram",
      status: "review",
      scheduledFor,
      ...post,
      platforms,
      reviewMessageId: data.result.message_id,
      imageUrl,
      slotKey,
    };
    addPost(record);
    logger.info("Пост отправлен на проверку", {
      recordId,
      reviewMessageId: data.result.message_id,
      platforms,
      withImage: Boolean(image),
    });
    return recordId;
  }

  /**
   * Промаркировать сообщение в тестовой группе после обработки:
   * «✅ Одобрено» / «❌ Отклонено» и убрать кнопки.
   */
  async markReviewed(record: PostRecord, status: "approved" | "rejected"): Promise<void> {
    if (!record.reviewMessageId) return;

    const header = status === "approved" ? "✅ Одобрено" : "❌ Отклонено";
    const text =
      `${header}\n` +
      `─────────────\n` +
      fullText(record) +
      `\n─────────────\n` +
      `🌐 Платформы: ${(record.platforms ?? ["telegram"]).map((p) => PLATFORM_LABEL[p]).join(", ")}`;

    try {
      await requestTelegramApi(this.token, "/editMessageText", "POST", {
        chat_id: this.reviewChannel,
        message_id: record.reviewMessageId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
      logger.info("Сообщение в тестовой группе обновлено", {
        recordId: record.id,
        status,
      });
    } catch (err) {
      logger.warn("Не удалось обновить сообщение в тестовой группе", err);
    }
  }

  /**
   * Обработать нажатия кнопок (getUpdates). Возвращает { approved, rejected }.
   * Вызывается по расписанию (GitHub Actions) — каждые N минут.
   */
  async processPendingReviews(): Promise<{ approved: number; rejected: number }> {
    let offset = this.readOffset();
    let approved = 0;
    let rejected = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await requestTelegramApi(
        this.token,
        `/getUpdates?offset=${offset}&timeout=1`,
        "GET"
      );
      const data = res.body as {
        ok?: boolean;
        result?: Update[];
        description?: string;
      };
      if (!data.ok || !Array.isArray(data.result)) {
        throw new Error(`getUpdates error: ${data.description ?? res.status}`);
      }
      if (data.result.length === 0) {
        hasMore = false;
        break;
      }

      for (const upd of data.result) {
        offset = upd.update_id + 1;
        if (!upd.callback_query) continue;

        const { id: cbId, data: cbData } = upd.callback_query;
        const recordId = cbData.split(":")[1];

        await this.answerCallback(cbId);

        if (!recordId) continue;
        const record = getPost(recordId);
        if (!record || record.status !== "review") {
          logger.warn("Ревью: запись не найдена или уже обработана", { recordId, cbData });
          continue;
        }

        if (cbData.startsWith("approve:")) {
          await this.approve(record);
          await this.markReviewed(record, "approved");
          approved++;
        } else if (cbData.startsWith("reject:")) {
          updatePost(recordId, { status: "rejected" });
          await this.markReviewed({ ...record, status: "rejected" }, "rejected");
          rejected++;
          logger.info("Пост отклонён", { recordId });
        }
      }
    }

    this.saveOffset(offset);
    return { approved, rejected };
  }

  private async approve(record: PostRecord): Promise<void> {
    const platforms = record.platforms ?? ["telegram"];
    const post: GeneratedPost = {
      title: record.title,
      text: record.text,
      hashtags: record.hashtags,
      keywords: record.keywords,
    };

    // Изображение (маскот или DALL-E) в момент апрува.
    const { image, imageUrl } = await resolvePostImage(this.config, record.title);

    await publishToPlatforms(this.config, post, platforms, {
      image,
      imageUrl,
      scheduledFor: record.scheduledFor,
    });
    updatePost(record.id, { status: "approved" });
    logger.info("Пост одобрен и опубликован", { recordId: record.id, platforms });
  }

  private async answerCallback(callbackQueryId: string): Promise<void> {
    try {
      await requestTelegramApi(this.token, "/answerCallbackQuery", "POST", {
        callback_query_id: callbackQueryId,
      });
    } catch (err) {
      logger.warn("Не удалось подтвердить нажатие кнопки", err);
    }
  }

  private readOffset(): number {
    if (!existsSync(OFFSET_FILE)) return 0;
    try {
      const d = JSON.parse(readFileSync(OFFSET_FILE, "utf8")) as { offset: number };
      return d.offset ?? 0;
    } catch {
      return 0;
    }
  }

  private saveOffset(offset: number): void {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(OFFSET_FILE, JSON.stringify({ offset }, null, 2), "utf8");
  }
}

interface Update {
  update_id: number;
  callback_query?: {
    id: string;
    data: string;
  };
}