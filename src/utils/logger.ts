const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

const current: Level = (process.env.LOG_LEVEL as Level) || "info";

function ts(): string {
  return new Date().toISOString();
}

function serialize(meta: unknown): string {
  if (meta instanceof Error) {
    return JSON.stringify({ message: meta.message, stack: meta.stack });
  }
  return JSON.stringify(meta);
}

function log(level: Level, msg: string, meta?: unknown): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(current)) return;
  const extra = meta !== undefined ? " " + serialize(meta) : "";
  console[level === "debug" ? "log" : level](`[${ts()}] [${level}] ${msg}${extra}`);
}

export const logger = {
  debug: (m: string, x?: unknown) => log("debug", m, x),
  info: (m: string, x?: unknown) => log("info", m, x),
  warn: (m: string, x?: unknown) => log("warn", m, x),
  error: (m: string, x?: unknown) => log("error", m, x),
};
