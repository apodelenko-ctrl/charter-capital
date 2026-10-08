# Charter Capital — Cloudflare sender

Cloudflare-native MTProto sender with a single SQLite Durable Object, its own alarms, durable history and private control through the existing Charter Telegram desk. No Linux server, Container, new Telegram login, bot token or public sender route is required by this design.

**Production cutover completed on 2026-10-08.** The existing Workers Paid account now runs one sender; the Mac dispatcher and LaunchAgent remain disabled. Real paid/free publications, saved visibility, both photo variants, a real FloodWait and hourly report delivery have been verified. See [DEPLOYMENT.md](DEPLOYMENT.md). The public checkout retains the compiled `LIVE_RELEASE = false` safety fuse; production was released from a reviewed private copy with the fuse enabled and private asset bindings. Dashboard variables cannot bypass that fuse.

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
- Private status, recent delivery evidence, stop, import/export, read-only preflight, exact-snapshot cutover acknowledgement, evidence-based attempt review, and reviewed rules updates. Reviews do not automatically unblock a group or replay a message. In the existing bot, `/groups` shows real sender state and `/pause_ads` stops the sender; these commands require the existing owner in the owner's private chat and retain webhook authentication and deduplication.
- Existing-session conversion/transfer utility, consistent cutover backup and paused rollback preparation. The owner stages secrets into an undeployed Worker version with local confirmation and disabled Wrangler logs. An explicitly delegated transfer uses both approval flags while retaining every stop/lock/OFF check. No utility stops or starts the Mac sender. A read-only readiness check never opens secret files or uses the network.
- TCP packets are written in ordered chunks of at most 16 KiB. Real Cloudflare uploads failed with a network disconnect when a large packet was written at once; the bounded-write release successfully uploaded the unchanged approved JPEG and PNG. Diagnostics contain stages, fixed reason codes and hashes, never exception text, credentials or packet contents.

## Validation

`npm ci --ignore-scripts && npm test` requires Node.js 22.20+ and Python 3. Tests cover the SQLite ledger, crash/stop/FloodWait paths, A/B visibility, current formats, both report segments, migration and rollback. The separate adapter test uses a local copy of the actual desk source with a mocked Bot API: authentication, private RPC, owner targeting, report delivery, deduplication and no replay of uncertainty. Current counts and rehearsal results are in [PARITY.md](PARITY.md).

The automated tests use synthetic peers, dummy keys and mock RPCs. A workerd probe verifies MTProto AES-IGE, upload serialization and byte-identical encrypted TCP packets against Node. **61 JavaScript/workerd tests and 22 Python tests passed**, plus the separate desk adapter check including owner-only stop, foreign-command rejection, deduplication and report delivery. Real-session acceptance was then performed during the owner-authorized cutover, from Cloudflare only.

A fresh stopped-Mac export was imported and checked against the cloud ledger before activation. Historical attempts, A/B and visibility records, archived rules, blocks and all 12 unresolved outcomes were preserved. The Mac history is frozen; the cloud ledger is now authoritative. Real snapshots, private source files, photos and session material are absent from this repository.

The previous 8-paid capacity result is obsolete. A/B plus saved verification at the current day/night cadence measured **6,845 synthetic attempts, 4,752,680 rows read and 220,777 estimated writes/day**, including alarm allowance. This exceeds Free's 100,000 writes/day. At 30 days the sender estimate is about 6.63 million writes, below Workers Paid's included 50 million/month; account-wide usage and compute can add costs. Workers Paid was already active before release. The agent purchased no subscription, server or Container. The plan starts at $5/month plus applicable usage and taxes; this is not a spending cap.

## Release status and owner handoff

Current operation is documented in [OWNER-HANDOFF.md](OWNER-HANDOFF.md); [CUTOVER.md](CUTOVER.md) remains the migration/rollback runbook. Do not repeat import or restart the old Mac. A single named Durable Object serializes all send and verification work; MTProto TCP connections are short-lived while authorization and delivery state persist. This is a Cloudflare port, not an unchanged Python daemon or a permanently open socket.

Supported current group limit basis is rolling 24 hours. Unsupported calendar-based rules are held for review. The global 24,000 ceiling is enforced over a rolling 24-hour window, conservatively stricter than the Mac's UTC calendar-day ceiling. Do not raise limits merely to satisfy a target count.

The source repository is public: never commit snapshots, local Bible/access documents, photos supplied privately, session files, API secrets, desk exports or `.dev.vars`.

## Official references checked 2026-10-07

- [Workers Python runtime](https://developers.cloudflare.com/workers/languages/python/stdlib/): the current Python/fcntl/local-SQLite daemon cannot simply be uploaded unchanged.
- [Cloudflare TCP](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) and [DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): native transport and independent scheduling primitives; alarms may be delivered again, so the durable ledger is authoritative.
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/): SQLite DO is available on Free, with shared account quotas. Containers require a paid plan and ephemeral disks need additional persistence design.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): if Free proves insufficient, Workers Paid starts at $5/month plus applicable overages. No upgrade or purchase was performed; this is not a request to buy it.
- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [Telethon sessions](https://docs.telethon.dev/en/stable/concepts/sessions.html): session material is an account credential, handled only by the owner at cutover.
