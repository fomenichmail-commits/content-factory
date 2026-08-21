import { randomBytes } from "node:crypto";

/**
 * Собрать multipart/form-data тело для Telegram Bot API.
 * fields — текстовые поля, file — файловое поле { name, filename, mimeType, data }.
 */
export function buildMultipart(
  fields: Record<string, string>,
  file: { name: string; filename: string; mimeType: string; data: Buffer }
): { buffer: Buffer; contentType: string } {
  const boundary = "----cf" + randomBytes(12).toString("hex");
  const chunks: Buffer[] = [];

  const push = (s: string) => chunks.push(Buffer.from(s));
  const pushBuf = (b: Buffer) => chunks.push(b);

  for (const [key, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`);
  push(`Content-Type: ${file.mimeType}\r\n\r\n`);
  pushBuf(file.data);
  push(`\r\n--${boundary}--\r\n`);

  return {
    buffer: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}