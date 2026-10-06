# Charter Cloudflare sender — disabled review build

This is a separate Cloudflare-native implementation under development. It does not run the existing Mac Python daemon. The deployed entrypoint has a compile-time `LIVE_RELEASE = false`, no public management endpoints, no cron triggers and no Telegram credentials. It cannot send messages or be activated by changing dashboard variables.

## Implemented and tested

- SQLite Durable Object ledger; one owner per Telegram account.
- Five-minute paid and ten-minute free minimum intervals, respecting longer group intervals and slowmode.
- Required paid_until and payment/recurrence confirmation; expiry rechecked after asynchronous preparation.
- Durable pending before network, recovery to uncertain on interruption, fail-closed ambiguity, stop preserved across asynchronous results.
- Persistent global FloodWait and per-group slowmode, existing blocked/uncertain history import, no overwrite on second import.
- Exact rolling 24-hour accounting using hourly aggregates plus a boundary-hour query to avoid repeatedly scanning the entire daily history.
- Idempotent hourly report records from real ledger facts; report generation is independent of sender state. Delivery to the existing owner bot is not connected yet.
- Cloudflare TCP socket adapter with fragmented-byte and ordered-write tests.
- Candidate MTProto transport with single-attempt RPCs, expected account ID, live membership/rights/rules checks, approved photo hash, raw file parts, message-ID extraction. Candidate is intentionally not wired into the production class.

## Validation

`npm ci --ignore-scripts && npm test` (Node.js 22.20+).

Tests use synthetic peers/data only. The integration tests run actual workerd + Durable Object SQLite with a fake outbound service. The transport probe performs AES-IGE roundtrip over 512 KiB and serializes a photo request without opening Telegram connections. A synthetic 24-hour schedule checks 8 paid plus 17 free groups (4,752 accepted fake operations). This is scheduling validation, not authorization to send that many real messages and not a measurement of production account quota.

Wrangler is pinned to 4.147.0; teleproto to 1.229.1. Runtime tests use compatibility date 2026-10-06. The test-only gateway can activate its fake transport; it is not referenced by the production Wrangler configuration. Never deploy test/gateway.mjs or wrangler.transport.jsonc.

## Current limitations / release gates

1. No end-to-end Telegram test, real session transfer, secret creation, or sending was performed. Local crypto latency is not a Cloudflare CPU-budget measurement.
2. Native normalized import schema exists, but the final Python-to-cloud migration/export adapter and field-by-field validation still need to be completed against the accepted sender revision. No private production data belongs in this repository.
3. Calendar-based daily group limits fail closed; currently only rolling_24h is accepted. Rule renewal/editing and explicit uncertain-resolution tooling still need a reviewed operator path.
4. The candidate Telegram adapter needs owner-approved acceptance for real peer cache/DC data, connection lifecycle, photo upload and account identity, after stopping the Mac sender. It is not enabled in makeTransport().
5. Reports are stored, not delivered. A private integration with the existing intake/owner channel, durable delivery outcomes and a missing-report alert remain required. No new bot token is needed merely to develop this integration.
6. No management endpoint is public. SenderControl is a service-binding-only entrypoint; no binding to an operator app is installed by this package.
7. No cron is installed in this disabled build. The scheduled handler can generate hourly records when the release eventually enables scheduling. No ChatGPT automation frequency limits are bypassed.
8. Check shared account requests/rows/duration/CPU budgets before enabling. Do not upgrade plans or create paid resources automatically.

## Owner steps

No manual credential or billing change is needed for this disabled review build. Do not add the working session yet.

At the separately agreed cutover: stop the Mac sender and all its schedulers, confirm lock release, take a consistent SQLite backup, preserve all attempts/holds/paid_until, import and verify the cloud ledger, then the owner transfers the existing session/API credentials through a trusted secure channel. Never put session/API secrets in GitHub, chat, build logs or an image. Activate only a reviewed release after proving there is exactly one active host. Rollback must copy the latest cloud history back before restarting Mac; never restore a stale pre-cutover database.

This package deliberately leaves live operation disabled while those gates remain open.
