import { logger } from "./logger.js";

const REQUEST_TIMEOUT_MS = 60000;

let cachedProxy: string | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAgent: any;

function getProxyUrl(): string | undefined {
  if (cachedProxy !== undefined) return cachedProxy;
  cachedProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined;
  return cachedProxy;
}

/** Создать ProxyAgent лениво (undici грузится только если задан прокси). */
async function getAgent(): Promise<unknown> {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;
  if (!cachedAgent) {
    const { ProxyAgent } = await import("undici");
    cachedAgent = new ProxyAgent(proxyUrl);
    logger.info("OpenAI-запросы идут через прокси", { proxy: proxyUrl });
  }
  return cachedAgent;
}

/** true, если задана переменная HTTPS_PROXY/HTTP_PROXY */
export function hasProxy(): boolean {
  return getProxyUrl() !== undefined;
}

/** Прокси-URL из окружения (для логирования) или undefined */
export function proxyUrl(): string | undefined {
  return getProxyUrl();
}

/** fetch с поддержкой HTTP(S)-прокси через undici ProxyAgent. */
export async function fetchWithProxy(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const agent = await getAgent();
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const merged = init ? { ...init, signal } : { signal };
  if (agent) {
    return fetch(url, { ...merged, dispatcher: agent as never });
  }
  return fetch(url, merged);
}
