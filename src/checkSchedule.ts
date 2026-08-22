import { loadSchedule, dueSlots, getSchedulePath } from "./scheduler.js";
import { getPosts } from "./utils/store.js";
import { logger } from "./utils/logger.js";

/**
 * Команда для GitHub Actions: проверяет, есть ли публикация в текущий момент.
 *   - если есть — выводит их и завершается с кодом 0 (workflow продолжит публикацию)
 *   - если нет — завершается с кодом 2 (workflow остановится, ничего не публикуем)
 *
 * Учитывает «пропущенные» слоты: если слот уже наступил и по нему ещё нет записи
 * в state.json (data/state.json коммитится после каждого запуска), он навёрстывается.
 *
 * Использование: node dist/checkSchedule.js
 */
async function main(): Promise<void> {
  const schedule = loadSchedule();
  const now = new Date();
  const window = Number(process.env.PUBLICATION_WINDOW_MIN ?? 10);
  const handled = new Set(
    getPosts()
      .map((p) => p.slotKey)
      .filter((k): k is string => Boolean(k))
  );
  const matches = dueSlots(schedule, now, process.env.CONTENT_TIMEZONE, {
    windowMinutes: window,
    isHandled: (k) => handled.has(k),
  });

  if (matches.length === 0) {
    logger.info("Нет публикаций в текущий момент времени");
    console.log("SCHEDULE_MATCH=false");
    process.exit(2);
  }

  logger.info("Найдены публикации для текущего момента", {
    count: matches.length,
    time: now.toISOString(),
  });
  console.log("SCHEDULE_MATCH=true");
  console.log(`SCHEDULE_FILE=${getSchedulePath()}`);

  for (const m of matches) {
    console.log(`TOPIC=${JSON.stringify(m.topic)}`);
    console.log(`PLATFORMS=${m.entry.platforms.join(",")}`);
    console.log(`SLOT_KEY=${m.slotKey}`);
    console.log(`SLOT_AT=${m.slotAt.toISOString()}`);
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error("Ошибка checkSchedule", err);
  process.exit(1);
});
