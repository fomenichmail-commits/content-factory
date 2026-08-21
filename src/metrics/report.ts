import type { MetricsSnapshot } from "./collector.js";
import type { PostEngagement } from "./engagement.js";

function fmt(n: number | undefined): string {
  return n === undefined ? "—" : String(n);
}

function diff(cur: number | undefined, prev: number | undefined): string {
  if (cur === undefined) return "";
  if (prev === undefined) return ` (новое)`;
  const d = cur - prev;
  if (d === 0) return " (без изменений)";
  const sign = d > 0 ? "+" : "";
  const pct = prev !== 0 ? `, ${((d / prev) * 100).toFixed(1)}%` : "";
  return ` (${sign}${d}${pct})`;
}

const PLATFORM_LABEL: Record<string, string> = {
  telegram: "TG",
  facebook: "FB",
  instagram: "IG",
};

function engagementLine(e: PostEngagement): string {
  const parts: string[] = [];
  if (e.views !== undefined) parts.push(`${e.views} просмотров`);
  if (e.reactions !== undefined) parts.push(`${e.reactions} реакций`);
  if (e.comments !== undefined) parts.push(`${e.comments} комм.`);
  if (e.reach !== undefined) parts.push(`охват ${e.reach}`);
  const what = parts.length ? parts.join(", ") : "нет данных";
  const label = PLATFORM_LABEL[e.platform] ?? e.platform;
  const title = e.title.length > 40 ? e.title.slice(0, 40) + "…" : e.title;
  return `• [${label}] ${title} — ${what}`;
}

/** Сформировать текстовый отчёт по последнему снимку с динамикой. */
export function buildReport(
  latest: MetricsSnapshot,
  previous?: MetricsSnapshot,
  engagement: PostEngagement[] = []
): string {
  const prev = previous?.metrics;
  const m = latest.metrics;

  const lines: string[] = [
    `📊 Отчёт по каналам — ${new Date(latest.at).toLocaleString("ru-RU")}`,
    "",
  ];

  if (m.telegram) {
    lines.push(
      `• Telegram: ${fmt(m.telegram.subscribers)} подписчиков${diff(
        m.telegram.subscribers,
        prev?.telegram?.subscribers
      )}`
    );
  }
  if (m.facebook) {
    lines.push(
      `• Facebook: ${fmt(m.facebook.fans)} фанов${diff(
        m.facebook.fans,
        prev?.facebook?.fans
      )}`
    );
  }
  if (m.instagram) {
    lines.push(
      `• Instagram: ${fmt(m.instagram.followers)} подписчиков${diff(
        m.instagram.followers,
        prev?.instagram?.followers
      )}` +
        (m.instagram.mediaCount !== undefined
          ? `, ${m.instagram.mediaCount} постов`
          : "")
    );
  }

  if (!m.telegram && !m.facebook && !m.instagram) {
    lines.push("Не удалось собрать метрики ни по одной платформе.");
  }

  if (engagement.length) {
    lines.push("", "📝 Вовлечённость по постам:", ...engagement.map(engagementLine));
  }

  return lines.join("\n");
}