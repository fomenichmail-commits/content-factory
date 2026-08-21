# 📦 Content Factory — фабрика контента

Автоматическая генерация и публикация постов в **Telegram**, **Facebook** и **Instagram** по расписанию, с ручным ревью-апрувом, сбором метрик роста и ежедневными отчётами.

## Как это работает

```
schedule.json (МСК + окно 10 мин)
   │  cron GitHub Actions (каждые 5 мин)
   ▼
проверка времени → генератор (LLM → пул → шаблоны) → баннер (маскот + текст)
   ▼
тестовая группа (кнопки ✅/❌) ──апрув──► публикация в канал
   ▼
метрики (daily) ──► отчёт в тестовую группу
```

- **Генерация**: гибридная — **LLM (OpenAI/Anthropic) → пул готовых постов → шаблоны + ротация**.
- **Пул контента**: `content/pool.json` — заранее подготовленные посты. Публикуются по кругу с подбором по ключевым словам. Работает без внешних AI-API.
- **Ревью**: посты сначала уходят в **тестовую группу** с кнопками **✅ Одобрить / ❌ Отклонить**. После апрува — публикуются в основной канал. Снимается флагом `CONTENT_REVIEW_MODE=off`.
- **Изображения**: баннер («маскот + текст поста») собирается локально через sharp (бесплатно, без API); опционально YandexART.
- **Расписание**: GitHub Actions cron; реальное время в `schedule.json` (часовой пояс + окно `PUBLICATION_WINDOW_MIN` для компенсации задержек cron).
- **Метрики**: ежедневный сбор подписчиков (TG/FB/IG) + вовлечённости по постам; отчёт приходит в тестовую группу.

## Текущий статус

| Компонент | Статус |
|---|---|
| Telegram (публикация, ревью, баннер) | ✅ работает |
| GitHub Actions (расписание, CI, тесты) | ✅ работает |
| Картинки — баннер (маскот + текст) | ✅ работает |
| Метрики (подписчики TG/FB/IG) | ✅ работает, отчёты в тестовую группу |
| Instagram MCP (профиль, чтение) | ✅ подключён |
| **Facebook / Instagram публикация** | ⏳ ждёт App Review или Postiz |
| LLM-генерация текста | ⏳ OpenAI — нет квоты (иногда `insufficient_quota`); контент из пула |

## Структура проекта

```
├── .github/workflows/
│   ├── content-factory.yml      # публикация по расписанию
│   ├── approve.yml              # обработка апрувов (кнопки ✅/❌)
│   ├── metrics.yml              # сбор метрик + отчёт
│   ├── meta-setup.yml           # настройка Meta (токены/ID)
│   ├── meta-check.yml           # проверка публикации Meta
│   ├── app-review-calls.yml     # тестовые вызовы для App Review
│   ├── marketing-calls.yml      # набор 500 вызовов Marketing API
├── schedule.json                # расписание публикаций (время/платформы/темы)
├── content/pool.json            # пул готовых постов (ротация)
├── postiz/                      # Postiz self-host конфиг (опция для Instagram)
├── docs/app-review.md           # готовая заявка на App Review Meta
├── test/                        # vitest unit-тесты (61 шт., покрытие ~88%)
├── src/
│   ├── config.ts                # загрузка конфигурации из .env/секретов
│   ├── scheduler.ts             # расписание + часовой пояс + окно публикации
│   ├── checkSchedule.ts         # CI-проверка «сейчас время публикации?»
│   ├── index.ts                 # основной пайплайн (direct / review)
│   ├── approve.ts               # CLI: обработка кнопок апрува (+ --watch)
│   ├── generate.ts              # CLI: сгенерировать пост
│   ├── metrics.ts               # CLI: метрики (+ --report)
│   ├── content/ (generator, pool, templates, text, banner, mascot, yandexArt, imageSource, image)
│   ├── publish/ (telegram, meta, pipeline)
│   ├── metrics/ (collector, engagement, report, store)
│   ├── review/service.ts        # ревью-публикация + обработка кнопок
│   └── utils/ (http, proxyFetch, multipart, logger, store)
└── data/                        # state.json, metrics.json, engagement.json (генерируются, коммитятся)
```

## Быстрый старт

```bash
npm install
cp .env.example .env      # заполните значения (см. ниже)
npm run build
npm run generate "Тема поста"        # проверить генерацию
npm run post:telegram "Тема"         # опубликовать в Telegram вручную
npm run check:schedule               # проверить, есть ли публикация сейчас
npm run metrics                      # собрать метрики
npm run metrics:report               # собрать + отправить отчёт в тестовую группу
npm run approve:watch                # фоновый обработчик кнопок (локально)
npm run test                         # unit-тесты
npm run test:coverage                # тесты + отчёт по покрытию
node dist/index.js                   # запустить полный пайплайн вручную
```

## Переменные окружения

### Telegram
```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...   # от @BotFather, бот — админ канала
TELEGRAM_CHANNEL=@dcl_x                # основной канал
TELEGRAM_REVIEW_CHANNEL=-1001827978177  # тестовая группа (ревью + отчёты) — опционально
```

### Режим ревью
```
CONTENT_REVIEW_MODE=on            # on = посты на проверку в тестовую группу
PUBLICATION_WINDOW_MIN=10         # окно ловли задержек cron (минуты)
```

### Meta (опционально — пока не подключена для постинга)
```
META_APP_ID=...
META_APP_SECRET=...
META_PAGE_ID=...
META_INSTAGRAM_ID=...
META_PAGE_ACCESS_TOKEN=EAA...      # long-lived Page Access Token
META_AD_ACCOUNT=act_...            # рекламный аккаунт для Marketing API тестов
```

### LLM (опционально)
```
CONTENT_LLM_PROVIDER=openai    # openai | anthropic | none
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1   # шлюз/прокси, если регион заблокирован
# ANTHROPIC_API_KEY=...
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Изображения
```
CONTENT_BANNER=on                # баннер: маскот + текст поста (локально, бесплатно)
CONTENT_MASCOT_FILE=assets/mascot.jpg
# Опционально YandexART (модификация маскота):
IMAGE_GENERATION=on
IMAGE_PROVIDER=yandex
YANDEX_API_KEY=...
YANDEX_KEY_ID=...
YANDEX_FOLDER_ID=...
# S3 (для Meta нужен публичный URL):
IMAGE_STORAGE=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
```

### Часовой пояс / прочее
```
CONTENT_TIMEZONE=Europe/Moscow
```

## Расписание

`schedule.json` (время в часовом поясе `timezone`):
```json
{
  "timezone": "Europe/Moscow",
  "entries": [
    { "hours": [9],  "minutes": [0], "platforms": ["telegram"],
      "topic": ["Утренний совет", "Мотивация на день"] },
    { "hours": [18], "minutes": [0], "platforms": ["telegram", "facebook", "instagram"],
      "topic": ["Вечерний вопрос", "Итоги дня"] }
  ]
}
```
- `hours`/`minutes` — когда публиковать.
- `topic` — строка или массив для ротации.
- `platforms` — куда публиковать.

## Метрики и отчёты

- `npm run metrics` — собрать подписчиков (TG/FB/IG) + вовлечённость по опубликованным постам → `data/metrics.json`, `data/engagement.json`.
- `npm run metrics:report` — собрать и отправить отчёт **в тестовую группу** (или `TELEGRAM_CHANNEL`, если review-канал не задан):
  ```
  📊 Отчёт по каналам — 21.08.2026, 23:00
  • Telegram: 148 подписчиков (+1, 0.7%)
  • Facebook: 60 фанов (новое)
  • Instagram: 24 подписчиков (без изменений), 69 постов

  📝 Вовлечённость по постам: ...
  ```
- Workflow `.github/workflows/metrics.yml` — ежедневно (20:00 UTC / 23:00 МСК).

**Вовлечённость по платформам:**
- **Telegram**: просмотры фиксируются при публикации (Bot API не отдаёт историю).
- **Facebook** / **Instagram**: метрики и вовлечённость — после App Review (права `instagram_manage_insights` и др.).

## Деплой на GitHub Actions

1. Создайте репозиторий, запушьте проект.
2. GitHub → **Settings → Secrets and variables → Actions** → добавьте секреты из таблицы выше
   (Telegram обязательны; Meta/LLM/Изображения — по мере необходимости; в **Variables** — `CONTENT_TIMEZONE`, `CONTENT_REVIEW_MODE`, `CONTENT_MASCOT_FILE`, `CONTENT_BANNER`, `PUBLICATION_WINDOW_MIN`).
3. Workflow `content-factory.yml` публикует по расписанию (review-режим), `approve.yml` обрабатывает кнопки, `metrics.yml` шлёт отчёты.

> **Про состояние**: GitHub Actions stateless, поэтому `data/` коммитится обратно в репозиторий
> после каждого запуска (пермишены `contents: write`). Всё в `data/` — без секретов.

## Instagram (постинг) — варианты

Публикация в Instagram/Facebook через Meta Graph API требует прав, которые выдаются **только через App Review** (`pages_manage_posts`, `instagram_content_publish`). Альтернативы:

1. **App Review**: заявка готова в `docs/app-review.md`. Подаётся на permissions → «Request advanced access». После одобрения — постинг работает автоматически.
2. **Postiz** (self-host `postiz/` или Cloud): использует официальный OAuth Instagram. Через **Instagram Standalone** можно подключить аккаунт как Instagram Tester без полного App Review.
3. **IG MCP** (`@mcpware/instagram-mcp`): чтение профиля работает; постинг — после App Review.

## Тесты

- `npm run test` — 61 unit-тест (vitest).
- `npm run test:coverage` — покрытие **~88%** (scheduler, text, templates, pool, generator, yandexArt, metrics/collector/report).
- Тесты гоняются автоматически в CI при каждом пуше (шаг «Unit-тесты»).

## Ручные CLI

```
npm run approve              # обработать нажатия кнопок (для CI)
npm run approve:watch        # фоновый обработчик каждые 30 сек (локально)
npm run add:post "Тема" "Текст"   # добавить пост в пул
npm run post:meta facebook "Тема"  # ручная публикация в FB/IG
npm run meta:info             # показать страницы/Instagram по токену
```
