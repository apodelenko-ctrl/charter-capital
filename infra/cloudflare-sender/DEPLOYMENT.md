# Production acceptance — 2026-10-08

The owner explicitly delegated the complete cloud migration, including existing-session transfer and activation. The existing Workers Paid subscription was already active. No new server, Container, credentials, permissions or subscription were created.

## Running deployment

| Component | Accepted release |
| --- | --- |
| Sender | `charter-cloudflare-sender`, application `2026-10-08.live.5` |
| Sender Cloudflare version | `d531103e-dc26-4b41-855b-168a64830f74` |
| Single SQLite DO | `SENDER`, class `Sender`, name `charter-primary-account` |
| Desk and owner commands | `charter-telegram-desk`, version `d8189b02-025f-4e9e-b784-d63a6c6280a9` |
| Sender hourly report Cron | `0 * * * *` |
| Desk report watchdog Cron | `10 * * * *` |
| Mac dispatcher / LaunchAgent | Stopped / disabled; never run beside the cloud sender |

The public checkout keeps its compiled OFF fuse. Production uses the reviewed private release copy with that fuse enabled, the two approved private static assets and existing Cloudflare Secrets. A single named DO owns delivery and verification; it uses its own alarms. GitHub holds source/review history. No GitHub Actions runner, Vercel background loop or ChatGPT scheduled task is used for sending.

## Observed evidence

- A fresh final backup of the stopped Mac was imported before activation. Remote verification retained all 5,880 source attempts, 3,470 A/B records, 5,023 visibility rows, 34 blocks, archived source/rules and both image hashes. All 12 historical uncertain outcomes remain held. Import cannot overwrite the initialized ledger.
- The source's deliberate dispatcher-disabled halt was acknowledged against the exact imported archive hash and attempt count, with a recorded owner-authorized cutover audit. Other halts, uncertainty and group blocks were not cleared.
- Existing Telegram session/API values were converted in memory and passed directly to an undeployed Cloudflare version over stdin under the Mac lock. Wrangler logs/metrics were disabled. No new Telegram login, local Telegram connection or credentials file was created. The values are not in this repository.
- Cloudflare read-only acceptance verified account identity, peer, policy and assets. Early full attempts exposed a native TCP write disconnect during photo upload; every affected attempt had `submitted=0`. Writing the same encrypted stream in ordered 16 KiB chunks resolved the observed failure. No Telegram API retry or weakened group check was introduced.
- First successful cloud intent: **2026-10-08 05:17:41.870 UTC**. By the 05:24 UTC observation, **40 new publications had API acknowledgement and separately saved `visibility=verified`**. Paid and free groups both succeeded; all nine paid placements had confirmed A/B evidence. Repeated paid cycles showed alternating AB/BA at 150–151 seconds where live checks permitted them; longer delays occurred where a check skipped a group.
- A real FloodWait was stored, the global wait was respected, and later sending resumed. Latest-message-ours/unreadable checks produced skips. No new uncertain outcome was observed during acceptance.
- The actual 04:00–05:00 UTC hourly report reached the existing owner through the desk outbox (`sent`, Bot API message ID 80). It correctly reported checks and zero publications before the fix. Sender receipt state can remain pending until the next hourly reconciliation; the desk outbox records actual delivery.
- `/groups` and `/pause_ads` now address the actual cloud sender. Original webhook authentication, the existing owner/private-chat check and durable update/report deduplication remain in place. `/pause` continues to address lead auto-replies.

The counts above are dated observations, not a live dashboard. Use private `status` and `recent` or the owner's bot commands for current state. Existing group restrictions, night cadence, paid_until and unresolved holds continue to apply; the migration does not promise delivery when Telegram or group rules prohibit it.

## Validation and operation

61 JavaScript/workerd tests and 22 Python tests passed. The Cloudflare runtime probe includes upload serialization, AES-IGE and encrypted-packet hashes compared with Node. Socket tests verify bounded writes preserve every byte and queue order. The separate real-desk-source test uses a mocked Bot API and confirms existing authentication, owner targeting, report uncertainty/deduplication, stop-command deduplication and rejection of foreign stop commands.

Local private evidence includes the final consistent backup, import verification, cutover audit, activation record, deployment source backups, test logs and sampled production journals. They are excluded from this public repository. Project-specific paths are recorded in the private project Bible.

Before changing a live sender release, stop it through private control and wait for in-flight completion. Verify the actual DO `status.version` after deployment: [Cloudflare documents eventual code propagation](https://developers.cloudflare.com/durable-objects/platform/known-issues/). Keep the Mac disabled. An accepted or uncertain Telegram publication must never be retried to compensate for deployment or acknowledgement failures. Follow [CUTOVER.md](CUTOVER.md) for exporting current cloud history and preparing a paused rollback.

The existing Workers Paid plan starts at $5/month plus applicable shared-account usage/taxes; this is not a hard budget limit. The measured write estimate fits its included SQL allowance, while CPU/duration and other applications still contribute to the account's usage. [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
