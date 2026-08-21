import https from "node:https";
import { logger } from "./logger.js";

/**
 * Известные IP дата-центров Telegram для обхода блокировки api.telegram.org
 * на уровне DNS/сети (некоторые провайдеры режут именно этот домен).
 * Можно переопределить через env TELEGRAM_API_IPS (через запятую).
 */
const TELEGRAM_FALLBACK_IPS = (process.env.TELEGRAM_API_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const KNOWN_IPS =
  TELEGRAM_FALLBACK_IPS.length > 0
    ? TELEGRAM_FALLBACK_IPS
    : ["149.154.167.220", "149.154.166.110", "149.154.175.50", "91.108.56.130"];

export interface JsonResponse {
  status: number;
  body: unknown;
}

interface ReqOptions {
  method: "GET" | "POST";
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Максимальное число попыток с откатом на другие IP */
  retries?: number;
  timeout?: number;
}

/** Отправить JSON-запрос к api.telegram.org с автоподбором рабочего IP. */
export async function requestTelegramApi(
  token: string,
  methodPath: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<JsonResponse> {
  const host = "api.telegram.org";
  const path = `/bot${token}${methodPath}`;
  const headers = {
    "Content-Type": "application/json",
    host,
    ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(JSON.stringify(body))) } : {}),
  };
  return requestTelegramApiWithHeaders(method, path, headers, body);
}

/**
 * Отправить raw-запрос (например multipart/form-data) к api.telegram.org
 * с автоподбором рабочего IP. bodyRaw — готовые байты тела запроса.
 */
export async function requestTelegramApiRaw(
  token: string,
  methodPath: string,
  method: "POST",
  rawBody: Buffer,
  contentType: string
): Promise<JsonResponse> {
  const host = "api.telegram.org";
  const path = `/bot${token}${methodPath}`;
  const headers = {
    "Content-Type": contentType,
    "Content-Length": String(rawBody.length),
    host,
  };
  return requestTelegramApiWithHeaders(method, path, headers, undefined, rawBody);
}

async function requestTelegramApiWithHeaders(
  method: "GET" | "POST",
  path: string,
  headers: Record<string, string>,
  jsonBody?: unknown,
  rawBody?: Buffer
): Promise<JsonResponse> {
  const host = "api.telegram.org";
  // Сначала стандартный резолвинг (в CI/нормальной сети он работает).
  try {
    return await requestOnce(
      { host, servername: host },
      { method, path, jsonBody, rawBody, headers },
      8000
    );
  } catch (err) {
    logger.debug("Стандартный запрос к api.telegram.org не удался, пробуем запасные IP", err);
  }

  // Откат: пробуем известные рабочие IP с корректным SNI (servername).
  for (const ip of KNOWN_IPS) {
    try {
      return await requestOnce(
        { host: ip, servername: host },
        { method, path, jsonBody, rawBody, headers },
        10000
      );
    } catch (err) {
      logger.debug(`IP ${ip} не ответил`, err);
    }
  }

  throw new Error("Не удалось подключиться к api.telegram.org (проверьте сеть/прокси)");
}

interface Target {
  host: string;
  servername: string;
}

function requestOnce(
  target: Target,
  opts: {
    method: "GET" | "POST";
    path: string;
    jsonBody?: unknown;
    rawBody?: Buffer;
    headers: Record<string, string>;
  },
  timeoutMs = 10000
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = https.request(
      {
        host: target.host,
        servername: target.servername,
        path: opts.path,
        method: opts.method,
        headers: opts.headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            /* не JSON — вернём строку */
          }
          done(() => resolve({ status: res.statusCode ?? 0, body }))();
        });
      }
    );

    // Ручной таймер: срабатывает всегда, включая фазу TCP-connect
    const timer = setTimeout(
      done(() => {
        req.destroy(new Error(`timeout (${target.host})`));
        reject(new Error(`timeout (${target.host})`));
      }),
      timeoutMs
    );
    req.on("error", (e) => done(() => reject(e))());

    if (opts.rawBody !== undefined) {
      req.write(opts.rawBody);
    } else if (opts.jsonBody !== undefined) {
      req.write(JSON.stringify(opts.jsonBody));
    }
    req.end();
  });
}