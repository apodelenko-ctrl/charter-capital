# Charter Capital · Forms-to-Telegram proxy

Прокси на Cloudflare Worker. Прячет токен Telegram-бота на сервере, чтобы он
больше не торчал в публичном JS сайта (из-за чего бота переименовали в «#FREEVPN»).

## Что делает
Сайт шлёт текст заявки на воркер → воркер добавляет токен (из секрета) и
пересылает в Telegram. Токена в коде сайта больше нет.

## Деплой (один раз)

1. Установить Wrangler (CLI Cloudflare), если нет:
   ```
   npm install -g wrangler
   ```

2. Залогиниться в Cloudflare:
   ```
   wrangler login
   ```

3. Из папки `cloudflare-worker/` положить токен бота как СЕКРЕТ
   (вставить НОВЫЙ токен, который выдал @BotFather после Revoke):
   ```
   wrangler secret put TG_TOKEN
   ```
   (вставьте токен в появившийся запрос)

4. (Опционально) сменить chat_id получателя — в `wrangler.toml`, поле `TG_CHAT_ID`.

5. Опубликовать:
   ```
   wrangler deploy
   ```

6. Wrangler выведет URL вида:
   `https://ccapital-forms-proxy.<ваш-субдомен>.workers.dev`
   Скопируйте его.

7. Вставьте этот URL в `js/forms-telegram.js` — константа `PROXY_URL` в начале файла.
   Закоммитьте и задеплойте сайт.

## Проверка
```
curl -i -X POST "https://ccapital-forms-proxy.<субдомен>.workers.dev" \
  -H "Origin: https://ccapital.pro" \
  --data-urlencode "text=Тест прокси ✅"
```
Должно прийти сообщение в Telegram и вернуться `{"ok":true,...}`.

## Безопасность
- Токен только в секрете воркера, в репозитории и в JS его нет.
- Origin-allowlist (`ccapital.pro`, `www.ccapital.pro`) отсекает чужие сайты.
- Длина текста ограничена 4096 символами (лимит Telegram).
