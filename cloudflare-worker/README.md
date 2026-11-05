# Charter Capital · protected lead delivery

The browser validates required fields before any delivery, obtains a Turnstile
challenge token, and POSTs JSON `{source, page, fields, token}` to the Worker.
The Worker validates the origin, body size, source/page schema, contact details,
required consent and honeypot, applies rate limits, verifies the single-use
Turnstile token (hostname + `lead` action), and constructs escaped Telegram HTML.
Arbitrary `{text: ...}` requests are rejected. Tokens and bot credentials are
never returned to the browser. Existing Formspree handlers run once after the
protected delivery succeeds; unchanged retries within five minutes do not send
a second Telegram notification from the same page.

## Configuration

`wrangler.toml` contains the bot chat ID and two approximate per-location rate
limits: 30 attempts/minute per network, and 5/minute per contact. Turnstile is the
independent proof required for each accepted request. Origin alone is not an
anti-bot credential. Network limits can affect people sharing a public network.

Secrets are set with `wrangler secret put TG_TOKEN` and
`wrangler secret put TURNSTILE_SECRET_KEY`, using the interactive prompt.
The public sitekey in `js/forms-telegram.js` belongs to the managed
**Charter Capital public enquiries** widget, restricted to `ccapital.pro` and
`www.ccapital.pro`. Do not use testing keys in production.

Keep existing dashboard variables when publishing:

```sh
wrangler deploy --dry-run
wrangler deploy --keep-vars
```

Publish the matching client scripts and HTML cache versions from an isolated,
clean checkout. There is no backwards-compatible raw-text endpoint.

## Verification without notifications

```sh
node --test cloudflare-worker/index.test.mjs tests/forms-telegram.test.cjs
```

Tests mock every external fetch, including Turnstile, Telegram and ingestion.
They exercise valid delivery as well as malformed, empty, oversized, foreign,
replayed and unverified requests. Do not test by sending messages to the live
bot. Production health can be checked with a GET to `/health`.
