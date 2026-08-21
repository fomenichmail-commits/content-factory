import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Config } from "../config.js";
import type { GeneratedImage } from "../content/image.js";
import { logger } from "../utils/logger.js";

export interface ImageUploader {
  /** Загрузить изображение и вернуть публичный URL. */
  upload(image: GeneratedImage, key: string): Promise<string>;
}

/**
 * Загрузка сгенерированных изображений в S3-совместимое хранилище
 * для получения публичного URL (требуется для Instagram).
 */
export class S3Uploader implements ImageUploader {
  private s3: S3Client;

  constructor(private config: Config) {
    const { awsAccessKeyId, awsSecretAccessKey, awsRegion } = config.storage;
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error(
        "Для S3-хранилища нужны AWS_ACCESS_KEY_ID и AWS_SECRET_ACCESS_KEY"
      );
    }
    this.s3 = new S3Client({
      region: awsRegion ?? "us-east-1",
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });
  }

  async upload(image: GeneratedImage, key: string): Promise<string> {
    const bucket = this.config.storage.s3Bucket;
    if (!bucket) throw new Error("Для S3-хранилища нужен S3_BUCKET");

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(image.base64, "base64"),
        ContentType: image.mimeType,
        ACL: "public-read",
      })
    );

    const region = this.config.storage.awsRegion ?? "us-east-1";
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    logger.info("Изображение загружено в S3", { url });
    return url;
  }
}