import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MetricsSnapshot } from "./collector.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const METRICS_FILE = join(DATA_DIR, "metrics.json");

interface MetricsState {
  snapshots: MetricsSnapshot[];
}

function empty(): MetricsState {
  return { snapshots: [] };
}

function read(): MetricsState {
  if (!existsSync(METRICS_FILE)) return empty();
  try {
    return JSON.parse(readFileSync(METRICS_FILE, "utf8")) as MetricsState;
  } catch {
    logger.warn("Не удалось прочитать metrics.json, начинаю с пустого");
    return empty();
  }
}

function write(state: MetricsState): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(METRICS_FILE, JSON.stringify(state, null, 2), "utf8");
}

/** Добавить снимок метрик в историю (максимум N последних). */
export function addSnapshot(snapshot: MetricsSnapshot, max = 365): MetricsState {
  const state = read();
  state.snapshots.push(snapshot);
  if (state.snapshots.length > max) {
    state.snapshots = state.snapshots.slice(state.snapshots.length - max);
  }
  write(state);
  return state;
}

/** Получить историю метрик. */
export function getSnapshots(): MetricsSnapshot[] {
  return read().snapshots;
}

/** Последний снимок или undefined. */
export function getLatestSnapshot(): MetricsSnapshot | undefined {
  const snapshots = read().snapshots;
  return snapshots.length ? snapshots[snapshots.length - 1] : undefined;
}

/** Предыдущий (до последнего) снимок для расчёта динамики. */
export function getPreviousSnapshot(): MetricsSnapshot | undefined {
  const snapshots = read().snapshots;
  return snapshots.length > 1
    ? snapshots[snapshots.length - 2]
    : undefined;
}