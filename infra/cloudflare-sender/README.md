# Charter Capital — Cloudflare sender

Cloudflare-native MTProto sender with a single SQLite Durable Object, its own alarms, durable history and private control through the existing Charter Telegram desk. No Linux server, Container, new Telegram login, bot token or public sender route is required by this design.

**Current release: disabled.** `LIVE_RELEASE = false` is a compiled fuse. Dashboard variables cannot enable it. The deployed configuration has no Telegram credentials, assets, routes, preview URL, service bindings or cron triggers. The Mac sender and the existing desk are not changed by this package.

## Implemented

- One intent at a time, persisted before network I/O; persistent random ID; interrupted delivery becomes uncertain and stops sending. No automatic replay of unknown outcomes.
- Source IDs, original timestamps/payloads, pending/uncertain, off-registry blocks, paid_until, account identity, pauses and global/per-group FloodWait survive migration. Import is paused and cannot overwrite an initialized ledger.
- Paid groups: minimum 5 minutes by day, 25 minutes during 23:00–07:00 Europe/Moscow; longer group rules always win. **23:00 is the explicitly recorded assumption for the night start**, pending owner correction. Free groups: max(10 minutes, group rules, slowmode). No catch-up bursts.
- Read the group's latest actual message before preparation and again immediately before publication. Our message, empty/unreadable history or failed reads prevent sending. Recheck durable stop and expiry after that final read.
- Verify the existing account, username, live peer ID, membership, rights, rules, pin and absence of Stars charges. Verify the approved JPEG hash; preserve caption and explicit bold entities.
- Independent hourly free-group reports; paid statistics included about every five hours. Reports use stored results, never predicted sends or screenshots. Imported rows without historical segment evidence stay unclassified. API acknowledgement is not described as proof of visibility.
- Existing desk outbox integration: fixed existing owner, durable report deduplication, explicit sent/uncertain/failed delivery states. Separate watchdog catches missing/delayed reports when that integration is enabled. It cannot report a complete outage of the shared Cloudflare account or the Telegram bot.
- Private status, stop, import/export, read-only preflight, evidence-based attempt review, and reviewed rules updates. Reviews do not automatically unblock a group or replay a message.
- Owner-only existing-session conversion/transfer utility, consistent cutover backup and paused rollback preparation. No utility stops or starts the live Mac sender.

## Validation

`npm ci --ignore-scripts && npm test` requires Node.js 22.20+ and Python 3. The current run passed **44 JavaScript/workerd tests and 7 Python tests**. The separate adapter test passed against a local copy of the actual desk source with a mocked Bot API: authentication, private RPC, owner targeting, report delivery, deduplication and no replay of uncertainty.

The transport tests use synthetic peers, a dummy key and mock RPCs. A workerd probe verifies MTProto AES-IGE and raw photo serialization. **No real Telegram connection or publication was performed.** The pinned dependency and Cloudflare TCP adapter still require real-session acceptance during the agreed cutover.

A read-only local rehearsal of the current Python history retained all attempts and unresolved holds; original imported payloads matched exactly. This was an audit in an in-memory database, not a final migration. The Mac history continues to change. The real source files and session are absent from this repository.

The conservative capacity test runs 8 paid + 17 free synthetic groups at daytime frequency for all 24 hours: 4,752 attempts/day, about 2.04 million SQLite rows read and 86,189 estimated writes including alarm allowance. Actual night policy reduces scheduled attempts. This is below the per-account Free allocations of 5 million reads and 100,000 writes/day, but leaves limited write headroom for other apps and growth. It does not certify remote CPU, connection reliability or shared account usage. Lifetime counters avoid rescanning all history in every status/report request.

## Release status and owner handoff

Follow [CUTOVER.md](CUTOVER.md). The remaining gate is the operational cutover: stop all Mac senders/schedulers, create the fresh snapshot, install the reviewed private desk integration/assets, transfer the existing secrets as owner, perform read-only acceptance, and authorize activation. The compile-time fuse and schedules remain unchanged until that step.

Supported current group limit basis is rolling 24 hours. Unsupported calendar-based rules are held for review. The global 24,000 ceiling is enforced over a rolling 24-hour window, conservatively stricter than the Mac's UTC calendar-day ceiling. Do not raise limits merely to satisfy a target count.

The source repository is public: never commit snapshots, local Bible/access documents, photos supplied privately, session files, API secrets, desk exports or `.dev.vars`.

## Official references checked 2026-10-06

- [Workers Python runtime](https://developers.cloudflare.com/workers/languages/python/stdlib/): the current Python/fcntl/local-SQLite daemon cannot simply be uploaded unchanged.
- [Cloudflare TCP](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) and [DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): native transport and independent scheduling primitives; alarms may be delivered again, so the durable ledger is authoritative.
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/): SQLite DO is available on Free, with shared account quotas. Containers require a paid plan and ephemeral disks need additional persistence design.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): if Free proves insufficient, Workers Paid starts at $5/month plus applicable overages. No upgrade or purchase was performed; this is not a request to buy it.
- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [Telethon sessions](https://docs.telethon.dev/en/stable/concepts/sessions.html): session material is an account credential, handled only by the owner at cutover.
