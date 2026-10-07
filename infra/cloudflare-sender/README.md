# Charter Capital — Cloudflare sender

Cloudflare-native MTProto sender with a single SQLite Durable Object, its own alarms, durable history and private control through the existing Charter Telegram desk. No Linux server, Container, new Telegram login, bot token or public sender route is required by this design.

**Current release: disabled; Workers Free is a launch blocker.** `LIVE_RELEASE = false` is a compiled fuse. Dashboard variables cannot enable it. This parity update is prepared in the draft branch only. No deployment, secret transfer, plan purchase, Mac stop or production desk change is part of this update. See [PARITY.md](PARITY.md) for evidence and limits.

## Implemented

- One intent at a time, persisted before network I/O; persistent random ID; interrupted delivery becomes uncertain and stops sending. No automatic replay of unknown outcomes.
- Source IDs, original timestamps/payloads, pending/uncertain, off-registry blocks, paid_until, account identity, pauses and global/per-group FloodWait survive migration. Import is paused and cannot overwrite an initialized ledger.
- Nine approved paid placements: 150 seconds by day, at least 25 minutes during 23:00–07:00 Europe/Moscow, matching the reviewed Mac runtime. Other paid rules retain the 5-minute floor. Free groups: max(10 minutes, group rules, slowmode). No catch-up bursts.
- A/B photo variants have durable per-attempt intent and confirmation. A Telegram acknowledgement enqueues a separate, serial visibility check; only verified text/photo/bold advances rotation. Restart resumes verification, never resends an accepted or uncertain publication. Preflight-only skips do not consume sending quota.
- Migration v2 preserves `paid_variant_attempts`, every visibility record, immutable original rules/registry, code manifest, finite audit/decisions, owner format consent and terminal review outcomes. Discovery/join queues stay disabled. Unknown SQLite tables or changed Mac code fingerprints require a new parity review.
- Read the group's latest actual message before preparation and again immediately before publication. Our message, empty/unreadable history or failed reads prevent sending. Recheck durable stop and expiry after that final read.
- Verify the existing account, username, live peer ID, membership, rights, rules, pin and absence of Stars charges. The narrow approved-broadcast exception handles its linked monoforum DM price; entity-level Stars prices are still blocked. Preserve JPEG/PNG bytes, approved hashes and UTF-16 bold spans, including approved short contact text and reviewed pin exceptions.
- Hourly paid and free reports use stored attempts and separate saved visibility. Checks without a send, failures, pending/uncertain, rolling quota and delivery holds are reported separately. Imported rows without historical segment evidence stay unclassified. API acknowledgement is not described as proof of visibility.
- Existing desk outbox integration: fixed existing owner, durable report deduplication, explicit sent/uncertain/failed delivery states. Separate watchdog catches missing/delayed reports when that integration is enabled. It cannot report a complete outage of the shared Cloudflare account or the Telegram bot.
- Private status, stop, import/export, read-only preflight, evidence-based attempt review, and reviewed rules updates. Reviews do not automatically unblock a group or replay a message.
- Owner-only existing-session conversion/transfer utility, consistent cutover backup and paused rollback preparation. No utility stops or starts the live Mac sender.

## Validation

`npm ci --ignore-scripts && npm test` requires Node.js 22.20+ and Python 3. Tests cover the SQLite ledger, crash/stop/FloodWait paths, A/B visibility, current formats, both report segments, migration and rollback. The separate adapter test uses a local copy of the actual desk source with a mocked Bot API: authentication, private RPC, owner targeting, report delivery, deduplication and no replay of uncertainty. Current counts and rehearsal results are in [PARITY.md](PARITY.md).

The transport tests use synthetic peers, a dummy key and mock RPCs. A workerd probe verifies MTProto AES-IGE and raw photo serialization. **No real Telegram connection or publication was performed.** The pinned dependency and Cloudflare TCP adapter still require real-session acceptance during the agreed cutover.

A read-only local rehearsal of the current Python history retained all attempts and unresolved holds; original imported payloads matched exactly. This was an audit in an in-memory database, not a final migration. The Mac history continues to change. The real source files and session are absent from this repository.

The previous 8-paid capacity result is obsolete. A/B plus saved verification at the current day/night cadence measured **6,845 synthetic attempts, 4,752,680 rows read and 220,777 estimated writes/day**, including alarm allowance. This exceeds Free's 100,000 writes/day. The test reports `free_sql_fits=false`; a passing measurement test does not mean the Free deployment gate passed. At 30 days this sender alone would use about 6.63 million writes, below Workers Paid's included 50 million/month; account-wide usage and compute still need owner review. No upgrade was made. The minimum infrastructure change is the existing account's Workers Paid plan, starting at $5/month plus applicable usage, without a separate server.

## Release status and owner handoff

Follow [CUTOVER.md](CUTOVER.md). First resolve the capacity/plan gate with the owner. Then coordinate exclusive ownership, a fresh consistent snapshot, the reviewed private integration/assets, owner-only transfer of existing secrets and real-session acceptance. Offline tests are not proof of Telegram connectivity. A single named Durable Object serializes all send and verification work; MTProto TCP connections are short-lived while authorization and delivery state persist. This is a Cloudflare port, not an unchanged Python daemon or a permanently open socket.

Supported current group limit basis is rolling 24 hours. Unsupported calendar-based rules are held for review. The global 24,000 ceiling is enforced over a rolling 24-hour window, conservatively stricter than the Mac's UTC calendar-day ceiling. Do not raise limits merely to satisfy a target count.

The source repository is public: never commit snapshots, local Bible/access documents, photos supplied privately, session files, API secrets, desk exports or `.dev.vars`.

## Official references checked 2026-10-07

- [Workers Python runtime](https://developers.cloudflare.com/workers/languages/python/stdlib/): the current Python/fcntl/local-SQLite daemon cannot simply be uploaded unchanged.
- [Cloudflare TCP](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) and [DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): native transport and independent scheduling primitives; alarms may be delivered again, so the durable ledger is authoritative.
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/): SQLite DO is available on Free, with shared account quotas. Containers require a paid plan and ephemeral disks need additional persistence design.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): if Free proves insufficient, Workers Paid starts at $5/month plus applicable overages. No upgrade or purchase was performed; this is not a request to buy it.
- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [Telethon sessions](https://docs.telethon.dev/en/stable/concepts/sessions.html): session material is an account credential, handled only by the owner at cutover.
