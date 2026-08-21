# Заявка на App Review — Meta for Developers / Advanced Access

**Приложение:** DCL X Content Factory (App ID: `1092641613195277`)
**Бренд:** DCL X (Data Chemistry Lab) — ИТ-компания в сфере страхования
**Аккаунты:** Facebook Page + Instagram `@dclxinsure`

Куда вставлять: https://developers.facebook.com/apps/1092641613195277 → **App Review** → **Permissions and Features** → для каждого права → **Request advanced access**.

---

## 0. Общее описание приложения (для основной страницы App Review / Privacy Policy)

**What does your app do:**
> DCL X (Data Chemistry Lab) is an IT company operating in the insurance technology sector. Our application is an internal "content factory": it automatically generates, schedules, and publishes marketing and educational content on the official Facebook Page and Instagram account of the brand, and collects engagement analytics for reporting. All content is created and approved by our in-house marketing team — the app only automates publishing and measurement on behalf of the company. Access is limited to the company's own Page administrator accounts; we do not process data of any third parties and never share data outside the company.

**Privacy Policy statement:**
> The app operates solely on behalf of DCL X (Data Chemistry Lab) and its own official social media accounts. It does not collect, store, or process any personal data of end users or third parties. Data obtained via the Facebook Graph API is limited to the company's own Page, Instagram account, and its published content. All data is stored on company-controlled infrastructure, is accessible only to authorized administrators, and is never sold or transferred to third parties. Privacy Policy: [ссылка на вашу privacy policy].

**RU:**
> DCL X (Data Chemistry Lab) — ИТ-компания в сфере страхования. Наше приложение — внутренняя «фабрика контента»: генерирует, планирует и публикует маркетинговый и образовательный контент на официальной странице Facebook и Instagram-аккаунте бренда, собирает аналитику вовлечённости. Весь контент создаётся и утверждается внутренним маркетинговым отделом — приложение лишь автоматизирует публикацию и измерение от имени компании. Доступ ограничен аккаунтами администраторов собственной страницы; данные третьих лиц не обрабатываются и не передаются за пределы компании.

---

## 1. `pages_manage_posts` — публикация на страницу Facebook

**Short description (EN):**
> Publish scheduled marketing and educational posts to the official Facebook Page of DCL X (Data Chemistry Lab), an IT company in the insurance sector.

**Detailed description (EN):**
> Our content factory generates marketing, product, and educational posts for the company's official Facebook Page. Posts are created and approved by the in-house marketing team, placed into a content queue, and then published automatically on a predefined schedule. The app publishes only on behalf of the company's own Page using the Page Access Token of the company administrator. No third-party users, pages, or accounts are affected, and no content is modified without team approval.

**Example data flow (EN):**
> 1. The marketing team approves a post in the internal CMS and assigns a publication time.
> 2. A scheduled job calls `POST /{page-id}/feed` with the approved message, image/video URL, and the Page Access Token of the company administrator.
> 3. The Graph API returns a `post_id`, which the app stores in an internal audit log.
> 4. The team tracks publishing status and results in the internal dashboard.

**RU:**
- **Краткое:** Публикация запланированных маркетинговых и образовательных постов на официальную страницу Facebook компании DCL X (Data Chemistry Lab).
- **Полное:** Фабрика контента создаёт посты для официальной страницы компании. Посты утверждаются маркетинговым отделом, помещаются в очередь и автоматически публикуются по расписанию. Публикация только от имени собственной страницы через токен администратора. Третьи лица/страницы не затрагиваются, контент не изменяется без одобрения.
- **Сценарий:** 1) Утверждение поста и времени в CMS. 2) Планировщик вызывает `POST /{page-id}/feed`. 3) Возвращается `post_id`, сохраняется в журнале аудита. 4) Статус отслеживается в панели.

---

## 2. `instagram_basic` — чтение данных Instagram-аккаунта

**Short description (EN):**
> Identify and link the business Instagram account (@dclxinsure) connected to our Facebook Page so the app can locate and manage the correct Instagram account.

**Detailed description (EN):**
> The app needs to resolve the Instagram Business Account connected to the company's Facebook Page and confirm it matches @dclxinsure. This permission is used only to read basic account metadata (Instagram user ID, username, profile info) to establish and maintain the correct Page-to-Instagram linkage for publishing and analytics. No follower data or content of third parties is accessed.

**Example data flow (EN):**
> 1. Backend calls `GET /{page-id}?fields=connected_instagram_account` using the Page Access Token.
> 2. The API returns the linked Instagram Business Account ID and username.
> 3. The app validates the username matches `@dclxinsure` and stores the Page↔IG mapping in internal configuration.
> 4. This mapping is used by the publishing and insights modules.

**RU:**
- **Краткое:** Идентификация и привязка бизнес-аккаунта Instagram (@dclxinsure) к странице Facebook.
- **Полное:** Только чтение базовых метаданных аккаунта (ID, username) для установления корректной связи «страница ↔ Instagram». Данные подписчиков и контент третьих лиц не запрашиваются.
- **Сценарий:** 1) Запрос связанного аккаунта. 2) Получение ID/username. 3) Валидация @dclxinsure и сохранение связки. 4) Использование модулями публикации и аналитики.

---

## 3. `instagram_manage_content` — публикация контента в Instagram

**Short description (EN):**
> Publish scheduled marketing posts (images, carousels, videos) and stories to the official Instagram account @dclxinsure.

**Detailed description (EN):**
> The app publishes approved marketing content to the company's own Instagram account on a predefined schedule, as part of the same content factory that manages the Facebook Page. Media files (images, carousels, short videos) are prepared and approved by the in-house marketing team; the app automates the upload and publishing flow with captions and hashtags on behalf of the business account. Publishing happens exclusively on the company's own account — content of other accounts is never accessed or modified.

**Example data flow (EN):**
> 1. A scheduled job picks the next approved post (image or carousel) with caption and hashtags.
> 2. The app uploads the media container via `POST /{ig-user-id}/media` (for carousels, via the carousel children container endpoint).
> 3. After the container is ready, the app publishes it via `POST /{ig-user-id}/media_publish` with the returned `creation_id`.
> 4. The returned `media_id` is stored in the audit log; publishing status is shown in the internal dashboard.

**RU:**
- **Краткое:** Публикация запланированных маркетинговых постов (изображения, карусели, видео) и историй на @dclxinsure.
- **Полное:** Публикация утверждённого контента на собственный аккаунт компании по расписанию. Медиа готовятся и утверждаются маркетинговым отделом; приложение автоматизирует загрузку и публикацию с подписями и хэштегами. Только собственный аккаунт компании; контент других не затрагивается.
- **Сценарий:** 1) Выбор следующего поста. 2) `POST /{ig-user-id}/media` (для каруселей — children). 3) `POST /{ig-user-id}/media_publish` с `creation_id`. 4) `media_id` в журнале аудита.

---

## 4. `instagram_manage_insights` — сбор метрик вовлечённости

**Short description (EN):**
> Collect engagement metrics (reach, impressions, likes, comments, profile views) of our own Instagram account for internal reporting and content-schedule optimization.

**Detailed description (EN):**
> The app reads insights for the company's own Instagram Business Account and its published media to measure campaign performance and audience engagement. Metrics are aggregated in an internal dashboard used only by the company's marketing team for weekly reporting and to optimize the publication schedule. Insights are collected exclusively for the company's own account and are never shared with third parties or used for ad targeting.

**Example data flow (EN):**
> 1. A scheduled job runs `GET /{ig-user-id}/insights?metric=reach,impressions,profile_views&period=day` for the reporting period.
> 2. The app also fetches per-media insights: `GET /{media-id}/insights?metric=likes,comments,saved,reach`.
> 3. Aggregated metrics are stored in the company's internal database.
> 4. The marketing team views weekly/monthly reports in the internal dashboard to adjust the content schedule.

**RU:**
- **Краткое:** Сбор метрик вовлечённости (охват, показы, лайки, комментарии, просмотры профиля) собственного аккаунта для внутренней отчётности.
- **Полное:** Чтение статистики собственного аккаунта и его медиа. Метрики агрегируются во внутренней панели для маркетингового отдела. Только собственный аккаунт; данные не передаются третьим лицам и не используются для таргетинга.
- **Сценарий:** 1) `GET /{ig-user-id}/insights?metric=reach,impressions,profile_views&period=day`. 2) Пост-метрики `GET /{media-id}/insights?metric=likes,comments,saved,reach`. 3) Агрегация во внутренней БД. 4) Отчёты для команды.

---

## Памятка перед отправкой
- Подставьте URL Privacy Policy в общем описании.
- На вопросы формы («How is data collected? / When is data deleted?»): данные — только собственные страница/аккаунт и их контент; хранение на внутренней инфраструктуре компании; срок хранения по внутренним правилам (укажите свой, например 2 года).
- Можно загрузить короткое видео флоу (публикация поста + просмотр метрик) — ускоряет одобрение.
