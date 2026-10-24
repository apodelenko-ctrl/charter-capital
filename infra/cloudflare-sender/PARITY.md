# Cloudflare parity review — 2026-10-07 (historical)

The following records the offline review at that date. The owner subsequently authorized the complete cutover, and production was accepted on 2026-10-08; see [DEPLOYMENT.md](DEPLOYMENT.md). Earlier launch blockers below are historical, not current operator instructions.

**Offline preparation passed. Production launch is blocked on capacity and the owner-controlled cutover.** This branch keeps `LIVE_RELEASE=false`. It was not deployed during this review. Mac remained the sole live sender; no Telegram session/API file was read, transferred or opened, and no message was sent.

## Reviewed source and scope

The comparison uses the Mac handoff dated 2026-10-07 and its actual `service-code` manifest, not the potentially different development checkout. `tools/source-compatibility.json` records SHA-256 fingerprints of eleven reviewed policy/runtime modules. The exporter rejects code drift until reviewed again. The private snapshot was captured at **2026-10-07 13:07:08.130 UTC**; it is an audit snapshot, not a stopped-Mac final export.

The original plan of eight paid groups every five minutes has been superseded by the reviewed Mac handoff: nine approved paid placements, daytime minimum 150 seconds and minimum 25 minutes during 23:00–07:00 Europe/Moscow. Other paid rules keep the five-minute floor. Free rules keep max(10 minutes, stricter group rules). The frozen snapshot admits nine paid and 25 free placements in both the original pure Mac policy functions and the cloud model. The earlier 12:33 handoff recorded 24 free placements; these are different timestamps, not an instruction to admit a new group. A fresh final snapshot determines launch scope.

Of 61 source rules, 57 normalize to cloud rules. Four remain explicit holds: one excluded peer and three unavailable/unresolved entries. Every original rule and registry entry remains in the immutable private archive. Finite discovery and growth stay disabled; no join or permission-expansion task is created. The finite audit's 51 target / 95 non-target / 22 unclear decisions and terminal outcomes are retained as evidence, not automatically rescheduled.

## Behavior checked

| Area | Result |
|---|---|
| Sender ownership | One named SQLite Durable Object; serial publication and visibility checks, persistent intent before send, no replay after an unknown outcome |
| Stop and recovery | Compiled OFF fuse; epoch/expiry checks before send; interrupted armed intent becomes uncertain and halts; interrupted preparation is cancelled without quota charge |
| Formats | Original JPEG/PNG bytes and hashes, UTF-16 bold spans, approved short contact text, exact A/B content and next variant |
| Rotation | Only saved `visibility=verified` advances A/B; acknowledgement alone does not; pending verification resumes without resending |
| Peer policy | Identity, membership, rules/pin, latest author, no Stars spending; existing narrowly approved broadcast/linked-DM exception and reviewed pin exceptions preserved |
| Cadence and limits | Paid/day/night, free rules, slowmode, paid expiry, latest-ours, global/group FloodWait and rolling group ceilings |
| Reports | Both paid and free every hour; acknowledgement, visibility, failures, checks without send, pending/uncertain, holds and 24-hour quota remain distinct |
| Existing desk | Existing owner/admin authentication, private RPC, durable outbox deduplication and uncertainty hold; no live desk changes |

The global 24,000 ceiling uses a conservative rolling 24-hour window, stricter than the Mac's UTC calendar day. This is an explicit difference. Imported attempts without reliable historical segment evidence remain unclassified. Short-lived MTProto TCP connections preserve existing authorization; this is a native cloud port, not an unchanged Python process or a promise of an indefinitely open socket.

## Validation evidence

**56 JavaScript/workerd tests and 21 Python tests passed.** The suite covers crashes, stop during I/O, FloodWait, quotas, current formats, deferred verification, A/B state, migration and rollback. Nine added Python cases cover the owner handoff: busy lock, live PID, stop marker, paused config/signature/disabled control, cancellation, state changes during confirmation, local OFF fuse, staging without deployment, hidden CLI diagnostics and no-network/no-secret readiness checks. A read-only readiness check on the live Mac returned `mac_worker_lock_busy`, with zero secret-file reads/network calls. The separate desk integration check passed with a mocked Bot API: existing authentication and owner targeting, private RPC, report deduplication, and no retry after uncertain report delivery. External network calls: zero.

The actual private snapshot was also imported/exported through the production `Sender` class in local workerd. Activation was rejected by the compiled fuse. No external I/O was permitted.

| Private snapshot item | Preserved |
|---|---:|
| Attempts, including original payloads | 4,234 |
| Paid variant records | 2,442 |
| Visibility records | 3,382 |
| Archived state, source and evidence files | 3,585 |
| Pending / uncertain at capture | 0 / 12 |
| Used rolling-24-hour attempts at capture | 2,707 |
| Snapshot bytes | 11,812,079 |

The workerd export was restored into a **new paused directory**. All 4,234 original attempt rows matched field-for-field, including exact source timestamps and nullable errors; all 2,442 paid variant rows matched. All 3,382 visibility records retained message IDs, text and status. Blocks and uncertainty were retained, both assets matched their hashes, and unchanged archive files matched byte-for-byte. Config paths/signatures were deliberately rewritten for the new directory and remain paused. No live Mac file was modified. Unit tests also cover new cloud UUID-to-Mac numeric IDs and preservation of new cloud outcomes.

Detailed snapshots, code archives and logs remain ignored local evidence; they are not committed to this public repository. Reproduce with `npm test`, `tools/validate_snapshot.mjs`, `tools/parity_audit.mjs`, `tools/rehearse_runtime.mjs` and the commands in [CUTOVER.md](CUTOVER.md).

## Capacity: Free gate failed

`test/capacity.test.mjs` runs two synthetic days in local workerd and meters the second day using SQLite cursor row counters. It includes A/B, verification, both hourly report segments and a separate alarm-write allowance. These are all-due capacity scenarios, **not observed Telegram traffic or guaranteed delivery counts**.

| Scenario | Attempts/day | SQL reads/day | SQL writes/day | Alarm allowance | Total estimated writes/day |
|---|---:|---:|---:|---:|---:|
| Nine paid, Moscow day/night; 22 free at 10 min, two at 60 min, one capped at two/day | 6,845 | 4,752,680 | 193,393 | 27,384 | **220,777** |
| Daytime upper scenario: nine paid at 150 sec, 24 free at 10 min | 8,640 | 6,115,056 | 246,288 | 34,560 | **280,848** |

Cloudflare Free allows 100,000 SQLite writes and five million reads/day across the account. Both scenarios report `free_sql_fits=false`; even the current day/night SQL writes alone exceed the write limit. A passing measurement test does not pass the deployment gate. The previous eight-paid capacity estimate must not be reused. [Official Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The least infrastructure change for this build is **Workers Paid in the existing Cloudflare account**, starting at $5/month plus applicable usage. The current scenario is about 6.63 million estimated writes per 30 days, below the plan's included 50 million writes/month for this sender alone. Account-wide usage, request/compute duration and real-session CPU still require review; $5 is not a guaranteed total bill. No plan change or paid commitment was made. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Containers are unnecessary for this port; they require a paid plan and their ephemeral disk would still require a separate persistence design for the original Python worker. Workers Python lacks the original `fcntl`/persistent-filesystem environment. These constraints were checked against [Containers FAQ](https://developers.cloudflare.com/containers/faq/) and [Python runtime documentation](https://developers.cloudflare.com/workers/languages/python/stdlib/).

Vercel Functions also do not host the unchanged daemon: documented invocation limits are 300 seconds on Hobby, 800 seconds on Pro/Enterprise, with a conditional 1,800-second beta maximum. Vercel Workflows would be another state/scheduler rewrite, not a drop-in migration. GitHub-hosted Actions jobs stop after six hours. This review therefore uses GitHub for code and Cloudflare for the independent application rather than chaining CI jobs into a sender. [Vercel limits](https://vercel.com/docs/functions/limitations), [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits).

## Remaining release gates

1. Owner resolves the Workers plan/capacity decision and agrees to a cutover window. Until then Mac remains the only live sender.
2. Operator stops Mac schedules and sender, verifies the lock is free, makes a fresh consistent backup and repeats parity checks. Retain every unresolved attempt and the existing no-repeat hold.
3. Release the reviewed private desk binding, sender binding and approved assets while the sender is still OFF; import the fresh final snapshot paused.
4. Owner alone stages the **existing** session/API credentials with `tools/owner_secrets.py` through stdin to `wrangler versions secret bulk`. The version remains undeployed; Wrangler disk logs and metrics are disabled. Local owner confirmation and Mac stop checks happen before credential files are read, under the exclusive Mac lock. The operator verifies the returned version and its OFF fuse before any separate deployment. No new login, credentials or rights. Never paste values into chat or GitHub.
5. In the agreed release, remove the compiled fuse while keeping the ledger stopped. Perform real read-only identity/TCP/policy acceptance, then authorize activation. Verify actual message IDs and saved visibility, A/B progression and reports before leaving the Mac off.

Offline mocks prove state handling and runtime serialization; they do not prove Telegram connectivity, remote CPU limits or real publication. The selected transport needs that exclusive real-session acceptance. Exact operator commands and rollback are in [CUTOVER.md](CUTOVER.md).
