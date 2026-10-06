# Disabled deployment contract

Production config: `wrangler.jsonc` only.

- Name: charter-cloudflare-sender.
- No route, workers.dev, preview URL, cron, service bindings, Telegram secrets, or paid product provisioning.
- New SQLite namespace for Sender; no existing intake database is modified.
- `/health` exists in code for runtime tests or a future intentionally exposed route; it is not public with the current configuration.
- Public import/start/stop requests receive 404. Private SenderControl cannot activate this build because of the compile-time fuse.
- Deployment of this review build does not migrate Mac data or turn off Mac processes.

Do not click Enable, add a cron, edit LIVE_RELEASE, or paste secrets as part of reviewing this build. Operational release is a separate cutover with current history, owner-only secret transfer and accepted transport tests.
