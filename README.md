# 📦 Content Factory — фабрика контента

Автоматическая генерация и публикация постов в **Telegram**, **Facebook** и **Instagram** по расписанию, с отслеживанием статуса публикаций, сбором метрик роста и отправкой отчётов.

## Как это работает

```
schedule.json ──► checkSchedule (время? да/нет) ──► генератор контента ──► публикаторы
                                                         │ (LLM или шаблоны)
                                                         ▼
                                                   state.json (статусы/ошибки)

metrics (daily cron) ──► сбор метрик (TG/FB/IG) ──► metrics.json ──► отчёт в Telegram
```

- **Генерация**: гибридная — LLM (OpenAI / Anthropic) → пул готовых постов → шаблоны + ротация.
- **Пул контента**: `content/pool.json` — заранее подготовленные посты (человеком или агентом). Публикуются по кругу с подбором по ключевым словам. Позволяет публиковать качественный контент без внешних AI-API.
- **Изображения**: DALL-E 3 генерирует картинку для поста; для Instagram она загружается в S3 и публикуется по публичному URL.
- **Публикация**: официальные API — Telegram Bot API и Meta Graph API.
- **Расписание**: GitHub Actions cron каждые 5 минут; реальное время задаётся в `schedule.json`.
- **Метрики**: ежедневный сбор подписчиков (Telegram / Facebook / Instagram), история в `data/metrics.json`, текстовый отчёт с динамикой отправляется в канал.

## Структура проекта

```
├── .github/workflows/
│   ├── content-factory.yml            # публикация по расписанию (каждые 5 мин)
│   └── metrics.yml                    # сбор метрик + отчёт (ежедневно)
├── schedule.json                      # расписание публикаций
├── content/pool.json                  # пул готовых постов (ротация)
├── src/
│   ├── config.ts                      # загрузка конфигурации из .env/секретов
│   ├── scheduler.ts                   # чтение schedule.json, поиск «наступивших» слотов
│   ├── checkSchedule.ts               # CI-проверка «сейчас время публикации?»
│   ├── index.ts                       # основной пайплайн
│   ├── generate.ts                    # CLI: сгенерировать пост
│   ├── metrics.ts                     # CLI: собрать метрики (+ --report)
│   ├── content/
│   │   ├── generator.ts               # генерация текста (LLM → пул → шаблоны)
│   │   ├── image.ts                   # генерация изображений (DALL-E 3)
│   │   ├── pool.ts                    # пул постов + ротация
│   │   └── templates.ts               # библиотека шаблонов
│   ├── publish/
│   │   ├── telegram.ts                # публикация в Telegram (текст + фото)
│   │   └── meta.ts                    # публикация в Facebook/Instagram
│   ├── storage/uploader.ts            # загрузка изображений в S3
│   ├── metrics/
│   │   ├── collector.ts               # сбор подписчиков с платформ
│   │   ├── engagement.ts              # вовлечённость по постам + история
│   │   ├── report.ts                  # формирование текстового отчёта
│   │   └── store.ts                   # история метрик (metrics.json)
│   ├── cli/
│   │   ├── post-telegram.ts           # ручная публикация в Telegram
│   │   └── post-meta.ts               # ручная публикация в Meta
│   └── utils/ (logger, store)         # логирование и состояние
└── data/                              # state.json + metrics.json + engagement.json (генерируются)
```

## Быстрый старт

```bash
npm install
cp .env.example .env      # заполните значения (см. ниже)
npm run build
npm run generate "Тема поста"        # проверить генерацию
npm run post:telegram "Тема"         # опубликовать в Telegram вручную
npm run post:meta instagram "Тема"   # опубликовать в Instagram вручную
npm run add:post "Тема" "Текст"      # добавить готовый пост в пул
npm run metrics                      # собрать метрики
npm run metrics:report               # собрать + отправить отчёт в канал
npm run check:schedule               # проверить, есть ли публикация сейчас
node dist/index.js                   # запустить полный пайплайн вручную
```

## Настройка API-доступов

### 1. Telegram
1. Создайте бота через [@BotFather](https://t.me/BotFather) → `/newbot`, получите **токен**.
2. Создайте канал (или используйте существующий).
3. Добавьте бота **администратором** канала (Settings → Administrators → Add admin → бот).
4. В `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_CHANNEL=@mychannel
   ```
   Для подсчёта подписчиков нужны права бота читать участников канала.

### 2. Facebook (Meta Graph API)
1. Создайте приложение в [Meta for Developers](https://developers.facebook.com/apps) (тип **Business**).
2. Добавьте продукт **Facebook Login** и **Instagram Graph API**.
3. Свяжите приложение со **страницей** (Business Manager) и **Instagram-аккаунтом**.
4. Получите **long-lived Page Access Token** (см. [документацию](https://developers.facebook.com/docs/pages-api/overview)):
   - User Token → `/oauth/access_token?grant_type=fb_exchange_token` → long-lived.
5. В `.env`:
   ```
   META_PAGE_ACCESS_TOKEN=EAA...
   META_PAGE_ID=123456789
   META_INSTAGRAM_ID=987654321
   ```
   > `META_INSTAGRAM_ID` — числовой ID Instagram-профиля (не @username). Найти: Graph API Explorer → `/{page_id}/instagram_accounts`.
   > Для метрик (page_fans, followers_count) токен должен иметь права `pages_read_engagement`, `instagram_basic`, `business_management`.

### 3. Изображения для постов

Режим картинок задаётся приоритетом в `resolvePostImage`:

1. **Баннер (маскот + текст поста)** — локально, бесплатно, без API:
   ```
   CONTENT_BANNER=on
   CONTENT_MASCOT_FILE=/path/to/mascot.jpg
   ```
2. **Модификация маскота через YandexART** — маскот модифицируется промтом под тему поста (не рисуется новая картинка):
   ```
   CONTENT_BANNER=off
   IMAGE_GENERATION=on
   IMAGE_PROVIDER=yandex
   CONTENT_MASCOT_FILE=/path/to/mascot.jpg
   YANDEX_API_KEY=...
   YANDEX_FOLDER_ID=...
   ```
3. **Маскот как есть** — просто вставляем файл маскота.
4. **Генерация с нуля** (DALL-E / YandexART) — когда маскота нет.

Для Meta (Instagram/Facebook) нужен публичный URL изображения → S3-хранилище:
```
IMAGE_STORAGE=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
```
Bucket должен разрешать `public-read` объекты. Без S3: Telegram получит фото (multipart),
а Instagram/Facebook — без изображения.

### 4. LLM (генерация контента) — опционально
```
CONTENT_LLM_PROVIDER=openai      # или anthropic / none
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1   # OpenAI-совместимый шлюз/прокси
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
```
Стратегия генерации: **LLM → пул → шаблоны**. При `none`, ошибке LLM или гео-блокировке
API используется пул готовых постов (`content/pool.json`), а при пустом пуле — шаблоны.

> Если OpenAI API недоступен в вашем регионе (ошибка `unsupported_country_region_territory`),
> подключите OpenAI-совместимый шлюз через `OPENAI_BASE_URL`, либо используйте пул контента
> (посты заранее готовит человек или агент): `npm run add:post "Тема" "Текст поста"`.

## Расписание

`schedule.json`:
```json
{
  "timezone": "Europe/Moscow",
  "entries": [
    { "hours": [9, 13, 18], "minutes": [0],
      "platforms": ["telegram", "facebook", "instagram"],
      "topic": ["Тема 1", "Тема 2"] }
  ]
}
```
- `hours`/`minutes` — когда публиковать (в указанном часовом поясе).
- `topic` — строка или массив (для ротации тем).
- `platforms` — куда публиковать.

## Метрики и отслеживание роста

- `npm run metrics` — собрать подписчиков с платформ + вовлечённость по опубликованным постам, сохранить в `data/metrics.json` и `data/engagement.json`.
- `npm run metrics:report` — собрать + отправить отчёт в Telegram-канал с динамикой:
  ```
  📊 Отчёт по каналам — 21.08.2026, 12:00
  • Telegram: 1500 подписчиков (+80, 5.6%)
  • Facebook: 800 фанов (+10, 1.3%)
  • Instagram: 320 подписчиков (+20, 6.7%)

  📝 Вовлечённость по постам:
  • [TG] Утренний совет… — 432 просмотров
  • [IG] Новость недели — 1200 просмотров, 34 реакций, 7 комм., охват 900
  • [FB] Вечерний вопрос — 500 просмотров, 12 реакций
  ```
- Workflow `.github/workflows/metrics.yml` запускает это ежедневно (20:00 UTC).

**Вовлечённость по платформам:**
- **Telegram**: просмотры захватываются при публикации (Bot API не отдаёт историю просмотров постов). Для полной статистики нужен сторонний аналитик-бот.
- **Facebook**: `/{post_id}/insights` — показы, реакции, вовлечённые пользователи.
- **Instagram**: `/{ig_media_id}/insights` — показы, охват, лайки, комментарии, сохранения (аккаунт должен быть Business/Creator, нужны права `instagram_manage_insights`).

## Деплой на GitHub Actions

1. Создайте репозиторий и запушите проект.
2. GitHub → **Settings → Secrets and variables → Actions** → добавьте секреты:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL`, `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`,
   `META_INSTAGRAM_ID`, `CONTENT_LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
   `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `IMAGE_GENERATION`, `OPENAI_IMAGE_MODEL`,
   `IMAGE_STORAGE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`.
   В **Variables** добавьте `CONTENT_TIMEZONE`.
3. Workflow `.github/workflows/content-factory.yml` запускается каждые 5 минут,
   проверяет `schedule.json` и публикует только в запланированные моменты.
   Workflow `metrics.yml` — ежедневно собирает метрики и шлёт отчёт.

> **Про состояние**: GitHub Actions — stateless, поэтому `data/state.json` и `data/metrics.json`
> собираются в artifact после каждого запуска. Для долгого хранения истории подключите
> хранилище (S3/внешний API) в `src/utils/store.ts` и `src/metrics/store.ts`.

## Roadmap

- [x] Генерация и публикация постов
- [x] Расписание (GitHub Actions cron)
- [x] Генерация изображений (DALL-E 3) для Instagram/Facebook/Telegram
- [x] Сбор метрик роста (подписчики) и отчёты
- [x] Метрики вовлечённости по постам (показы, реакции, лайки, комментарии)
- [ ] Автоподбор тем по анализу вовлечённости
- [ ] Двухфакторная валидация контента перед публикацией