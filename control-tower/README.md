# Charter Capital · Control Tower

Единый веб-дашборд мониторинга и запуска автоматизаций **ccapital.pro**.

Dark-mode «банковский терминал», акцент **#D4AF37** (в тон charter-flow-app).

---

## 1. Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│  Браузер (мобильный + desktop)                                   │
│  control-tower/public — статика (HTML/JS/CSS)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ Bearer DASHBOARD_SECRET
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker: ccapital-control-tower                       │
│  · GET /api/overview     — светофор 15 юнитов                    │
│  · GET /api/leads        — forms + chat stats                    │
│  · GET /api/content/*    — kanban + drafts (GitHub API)          │
│  · POST /api/actions/*   — IndexNow, Deploy, Rebuild feed        │
│  · KV TOWER_KV           — лог событий + ручные метрики Директа   │
└─────┬───────────┬──────────────┬────────────────────────────────┘
      │           │              │
      ▼           ▼              ▼
 GitHub API   forms-proxy    charter-chat
 (Actions,    /health       /health + /health/stats
  contents)   .workers.dev   .workers.dev
      │
      ▼
 GitHub Actions: control-tower-actions.yml
 (deploy · rebuild_dzen_feed · regenerate_direct · indexnow_default)
      │
      ▼
 ccapital.pro (Pages) · journal/feed.xml · IndexNow endpoint
```

**Принцип:** токены (TG, Anthropic, IndexNow, GitHub) **только в секретах Workers**. Фронт — пустой shell + auth.

---

## 2. Health-эндпоинты (добавлены / требуются)

| Сервис | URL | Ответ |
|--------|-----|--------|
| **Control Tower** | `GET /api/health` | `{ ok, service, ts }` — публичный |
| **Forms proxy** | `GET /health` | `{ ok, service, ts, forms_today?, last_form_at?, errors_24h? }` |
| **Charter chat** | `GET /health` | `{ ok, service, ts, dialogs_24h?, d1_ok? }` |
| **Charter chat stats** | `GET /health/stats?key=ADMIN_KEY` | `{ leads_today, recent[], … }` — для панели лидов |
| **Live site** | `HEAD https://ccapital.pro/` | last-modified |
| **IndexNow key** | `GET https://ccapital.pro/<KEY>.txt` | тело = ключ |
| **Dzen feed** | `GET /journal/feed.xml` | число `<item>`, наличие content:encoded |

### Опционально (следующий шаг)

- **Forms proxy:** привязать KV `FORMS_KV` для счётчиков заявок по `form_source`
- **Charter chat:** `avg_response_ms` из логов LLM
- **Дзен:** API канала (когда появится OAuth) → подписчики, статусы статей

---

## 3. MVP — деплой

```bash
cd control-tower
npm install
wrangler kv namespace create TOWER_KV   # подставить id в wrangler.toml

wrangler secret put DASHBOARD_SECRET
wrangler secret put GITHUB_TOKEN        # PAT: repo + workflow
wrangler secret put INDEXNOW_KEY          # из indexnow.sh
wrangler secret put ADMIN_KEY             # тот же, что charter-chat /admin

npm run deploy
# → https://ccapital-control-tower.<account>.workers.dev
```

Локальная разработка:

```bash
npm run dev
# открыть http://localhost:8787
```

Перед первым Deploy / Rebuild feed — закоммить `.github/workflows/control-tower-actions.yml` в `main`.

---

## 4. Подключить вручную

| Что | Зачем |
|-----|--------|
| `GITHUB_TOKEN` (PAT) | Actions runs, contents API (drafts, kanban), workflow_dispatch |
| `INDEXNOW_KEY` | Ping IndexNow из Worker (тот же ключ, что в `indexnow.sh`) |
| `ADMIN_KEY` | Статистика лидов из charter-chat D1 |
| `DASHBOARD_SECRET` | Basic/Bearer auth дашборда |
| KV `TOWER_KV` | Лог событий + ручной ввод метрик Директа |
| KV `FORMS_KV` (forms-proxy) | Счётчики заявок на прокси (опционально) |
| **Яндекс.Директ API** | Панель «Трафик» — сейчас заглушка + ручной ввод |
| **Яндекс.Метрика API** | Конверсии — не подключено |
| **Дзен OAuth** | Статусы статей канала — ручной чеклист |
| Custom domain | `tower.ccapital.pro` → Worker (DNS Cloudflare) |

---

## 5. Юниты (15 карточек)

См. `worker/units.js` — реестр с блоками A–F из ТЗ.

**Безопасные действия из UI:**
- IndexNow ping (default / recent)
- GitHub workflow: deploy, rebuild feed, regenerate CSV

**Только мониторинг (ручной запуск локально):**
- Dzen extract / browser publisher
- Stories / Reels / Acts PDF
- Посты в TG/VC (черновики в `drafts/`)

---

## 6. Связь с Portfolio Orchestrator

SLA-оркестратор (`~/portfolio-orchestrator`) контролирует **заявки и эскалации CEO**.
Control Tower контролирует **маркетинговые автоматизации ccapital.pro**.
В перспективе: webhook «новый лид из формы» → `create_ticket(project_code="charter")`.
