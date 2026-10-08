# Protected reports for an explicit UTC window

Implementation prepared and tested on 2026-10-08. **Not deployed.** This document
does not certify current cloud activity. The existing sender remains on its live
release; this change adds no schedule, message, credential, binding or privilege.

## API contract

After an approved deployment of the sender and desk adapter:

```http
GET /admin/sender/report?scope=free&start_utc=2026-10-08T05%3A00%3A00Z&end_utc=2026-10-08T06%3A00%3A00Z
```

Use the existing protected desk origin from the private deployment handoff.
The desk's existing `Authorization: Bearer <ADMIN_SECRET>` check is unchanged.
The value must already be available to an authorized client through its existing
secret mechanism. Do not paste it into a URL, prompt, repository, report, or log.
This change does not provision that client or grant access. The sender itself
continues to have no public administration route.

Exactly three query parameters are accepted: `scope`, `start_utc`, `end_utc`.
Dates require UTC `Z`, seconds, and optionally exactly three millisecond digits.
The window is `[start_utc,end_utc)`, measured by each intent's creation time.
It must be in the past and at most 24 hours. Duplicate/extra parameters, future
times and invalid dates return 400. Other methods return 405. More than 20,000
records or 16 MiB returns 413; it never silently takes the last N rows. A caller
can split a rejected window into adjacent non-overlapping windows. Authentication
failure remains 403. An unavailable report returns 503, not a zero result.
Successful responses use `Cache-Control: private, no-store` and `Vary: Authorization`.

The service RPC is `SENDER_CONTROL.queryReport({scope,start_utc,end_utc})`. It uses
the desk's **existing** binding and returns `{ok:true,report}` or a bounded error
envelope. No new public RPC gateway or service binding is introduced.

## Scope and interpretation

`free` selects only immutable attempt records with `segment='free'`. Unknown
records are never inferred to be free from a current rule, handle or membership.

`paid` selects only the privately configured original eight chat IDs, regardless
of a historical row's stored segment. `selected_unknown_segment_records` makes
unknown rows explicit. The ninth current paid group is excluded.

The public `src/report-scope.mjs` contains an empty allowlist and paid requests
fail closed with 503. Set the reviewed eight IDs only in the private release copy,
using the private reporting handoff. No runtime caller can supply or change the
allowlist; the RPC passes only scope and timestamps. Free reporting works without
this private allowlist. No database or campaign configuration is changed.

The response separates:

- `summary.submitted_attempts`: requests with a persisted submission marker;
  preparation checks and recorded skips are counted separately.
- `api_acknowledged` (`sent`), `externally_confirmed` (`sent_external`), and
  `verified_publications`: acknowledgement alone is not proof of visibility.
- `records`: every selected intent, outcome, recorded delivery format, variant,
  stored visibility check, error category and available Telegram message links.
  Message text, pins, raw errors, photos, identity and credential files are absent.
- `groups`: per-group window totals, including all eight paid groups when empty.
- `registry.account_base` and `registry.scope_base`: imported base and membership
  counts. These are dated snapshots, not live membership checks. Member audience
  size is never treated as proof that our account joined a group.
- `admissions` and each group's `current_admission`: current rules and local
  holds. Being locally unheld does not mean due now, globally eligible, or freshly
  checked with Telegram. Groups missing a rule remain explicit.
- `shared_account_state`: current account enable/halt, FloodWait, daily quota,
  global gap, unresolved history and blocks across every segment. These values
  are not attributed to a particular report scope.

Formats come from the delivery record, never today's campaign template. Without
that evidence the format is `unknown`. Visibility uses the latest stored check at
query time, including a check performed after the requested activity window.
Links may require membership and are not a fresh visibility test.

All counts describe the retained ledger. The earliest retained attempt and the
import snapshot timestamp are returned. Unscheduled candidates have no attempt
row and cannot be reconstructed as recorded skips. There is no report-time
Telegram connection or inferred success.

## Use by an already authorized cloud automation

This is an execution recipe, **not** a claim that an authorized cloud reader is
connected. No such callable client was available in this task. Local Wrangler
authorization is not automatically inherited by a ChatGPT automation or GitHub.

1. Choose one fixed UTC `end_utc` for the run. For the free report subtract one
   hour; for the original eight paid report subtract five hours.
2. Make the two GET requests through the reader's existing protected HTTP action
   or use its existing authorized service binding. Do not create tokens, copy Mac
   secrets, expose the endpoint or use public web search as the authenticated
   reader. If no authorized action exists, report unavailable data.
3. Require HTTP 200, `schema='charter.window-report.v1'`, the exact requested scope
   and window, `coverage.truncated=false`, and
   `coverage.record_count===records.length===summary.ledger_records`.
4. For paid, require the exact eight IDs in the private reviewed allowlist. Do not use the nine-group hourly
   report as a substitute. For free, preserve the unknown exclusion explicitly.
5. Present publications, verified visibility, attempts, checks/skips and failures
   separately; then present base, imported membership, current admissions and
   shared account restrictions with their timestamps. Use provided message links.
6. A 403/503/missing action is a data-access failure, not proof of no activity.
   Historical Mac reports and the limited `/recent` endpoint are not substitutes.

No automation, notification destination or cadence is changed by this patch.

## Deployment boundary

The code is ready in the existing review branch. Deployment and live-window
validation remain blocked by the absence of a verified authorized cloud reader
and by the running sender's restart behavior. No secret was read or transferred
for this reporting change.

Cloudflare resets a Durable Object when it is assigned a new Worker version.
The current sender deliberately recovers a submitted pending request as uncertain
and stops for review. Updating during a send could therefore alter pause/history
state, which this task does not authorize. A single earlier `pending=0` observation
does not guarantee safety throughout an eventually consistent deployment.

Before publication, resolve the existing authorized reader and agree a safe
maintenance/cutover procedure if it requires a temporary pause. Do not bypass
`recover`, clear pending/uncertain, change alarms or relax safeguards to deploy a
report. Keep the private fixed eight-ID reporting allowlist, production compile-time
release fuse and all existing bindings,
secrets and cron values as they are. Deploy the sender's backward-compatible RPC
before the desk route; during version skew the desk returns 503. Then validate
actual complete free 1h and paid8 5h windows through that authorized reader and
record version IDs and exact UTC windows. Never deploy the public offline-fused
review configuration as the running sender.

Official references checked 2026-10-08:
[Durable Object version assignment and resets](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/),
[eventually consistent code updates](https://developers.cloudflare.com/durable-objects/platform/known-issues/),
[Data Studio access](https://developers.cloudflare.com/durable-objects/observability/data-studio/).
Data Studio is an authenticated owner inspection route, not proof that a cloud
automation already has an authenticated reporting action.

## Validation

`npm test`: 71 JavaScript/workerd tests and 22 Python tests passed. Tests include
more than 100 records, exact UTC boundaries, original-eight filtering, unknown
exclusion, formats/visibility, membership/admission separation, and SQL-read-only
state equality. A workerd test queries during pending preparation without
changing sender state or sending. The actual desk wrapper test uses synthetic
credentials and mocked Bot API responses; report requests preserve auth and desk
state and generate no notifications.

A separate offline rehearsal used the full imported history, compared selected
record IDs/counts and visibility with the source snapshot, and verified unchanged
database contents. Exact identifiers, operational values and evidence remain in
the private local reporting handoff. This rehearsal is historical evidence, not
present cloud statistics. Actual live-window validation is still outstanding.
