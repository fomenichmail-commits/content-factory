# Postiz — self-hosted SMM для публикации в Instagram/Facebook без App Review

Postiz использует **официальный OAuth Instagram Login** — не требует Advanced Access (App Review)
в Meta Graph API, в отличие от нашего прямого подхода.

## Установка

1. **Перезагрузите Windows** (Docker Desktop требует ребут после установки).
2. Запустите Docker Desktop и дождитесь статуса «Docker Engine running».
3. В папке `postiz/` создайте `.env`:
   ```
   FACEBOOK_APP_ID=1092641613195277
   FACEBOOK_APP_SECRET=05ded5a914365e7eea5acbef7def9ccd
   INSTAGRAM_APP_ID=1092641613195277
   INSTAGRAM_APP_SECRET=05ded5a914365e7eea5acbef7def9ccd
   ```
   (Instagram использует то же приложение Meta, что и Facebook.)
4. Запустите:
   ```
   docker compose up -d
   ```
5. Откройте http://localhost:5000 → зарегистрируйтесь (первый пользователь = админ).

## Подключение Instagram

1. В Postiz: **Settings → Integrations → Instagram** → Connect.
2. Пройдите OAuth-логин вашим Instagram Business-аккаунтом (@dclxinsure).
3. Готово — публикация работает без App Review.

## Подключение к opencode (MCP)

MCP `postiz` уже добавлен в `~/.config/opencode/opencode.jsonc`.
Нужно задать переменные окружения и перезапустить opencode:

```
POSTIZ_API_KEY=<ваш API-ключ из Postiz: Settings → API Keys>
POSTIZ_API_URL=http://localhost:5000
```

API-ключ создаётся в Postiz → Settings → API Keys → Create new key.

## Важно

- Instagram в Postiz требует **Business/Creator** аккаунт (у вас @dclxinsure — уже Business).
- Для Facebook/Instagram OAuth нужно, чтобы Meta-приложение имело настроенный
  «Instagram Basic Display» / «Facebook Login» с redirect URI Postiz (http://localhost:5000).
  См. docs.postiz.com/integrations/instagram
