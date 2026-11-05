import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { FORM_SCHEMAS } from './index.js';

const origin = 'https://ccapital.pro';
const fixtures = {
  partner_access_modal: { email: 'a@example.com', full_name: 'Анна', contact_channel: 'Email', privacy_agree: 'yes' },
  property_ru: { name: 'Анна', email: 'a@example.com', agree: 'on' },
  property_en: { name: 'Anna', email: 'a@example.com', agree: 'on' },
  pay_usdc_b2b: { name: 'Anna', contact: '@anna', supplier_country: 'Thailand' },
  pay_lite_intake: { company: 'Company', jurisdiction: 'TH', reg_id: '123', contact: 'Anna', email: 'a@example.com', benef_country: 'DE', benef_name: 'Supplier', amount: '15 000', currency: 'EUR', purpose: 'Goods' },
  pay_pro_intake: { task: 'Supplier payment', amount: '10 000', currency: 'USD', principal_country: 'TH', benef_country: 'DE', benef_type: 'Корпоративный', email: 'a@example.com' },
  slovakia_intake: { name: 'Anna', contact: '@anna' },
  crypto_exchange_v2: { amount: '100000', contact: '@anna' },
  company_intake: { name: 'Anna', email: 'a@example.com', agree: 'on' },
  evacuation_intake: { contact: '@anna' }
};
function lead(source = 'partner_access_modal', overrides = {}) {
  return { source, page: FORM_SCHEMAS[source].pages[0], fields: { ...fixtures[source] }, token: 'test-token', ...overrides };
}
function request(body = lead(), options = {}) {
  const { raw, path = '/', method = 'POST', origin: requestOrigin = origin, ip = '203.0.113.8', headers = {}, ...rest } = options;
  const h = { 'Content-Type': 'application/json', ...headers };
  if (requestOrigin !== null) h.Origin = requestOrigin;
  if (ip !== null) h['CF-Connecting-IP'] = ip;
  return new Request(`https://proxy.invalid${path}`, { method, headers: h, ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: raw ?? JSON.stringify(body) }), ...rest });
}
async function run(req, options = {}) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = [], keys = [], pending = [], puts = [];
  const env = {
    TG_TOKEN: 'mock-token', TG_CHAT_ID: 'mock-chat', TURNSTILE_SECRET_KEY: 'mock-turnstile-secret',
    FORM_RATE_LIMITER: { async limit(arg) { keys.push(arg.key); return { success: options.rate !== false }; } },
    ...options.env
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.ok(init.signal instanceof AbortSignal, 'every upstream fetch has a timeout signal');
    if (String(url).startsWith('https://challenges.cloudflare.com/turnstile/')) {
      if (options.hang === 'verification') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('mock timeout')), { once: true }));
      if (options.verifyThrows) throw new Error('mock upstream private error');
      const result = options.verify ?? { success: true, hostname: new URL(req.headers.get('Origin')).hostname, action: 'lead' };
      return new Response(JSON.stringify(result), { status: options.verifyStatus ?? 200 });
    }
    if (String(url).startsWith('https://api.telegram.org/botmock-token/sendMessage')) {
      if (options.hang === 'telegram') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('mock timeout')), { once: true }));
      if (options.telegramThrows) throw new Error('do not expose mock-token');
      return new Response(options.telegramRaw ?? JSON.stringify(options.telegram ?? { ok: true, result: { message_id: 1 } }), { status: options.telegramStatus ?? 200 });
    }
    if (String(url) === 'https://ingest.invalid/api/ingest/lead') return new Response('{"ok":true}');
    throw new Error('Unexpected external fetch: ' + url);
  };
  if (options.hang) globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay === 8000 ? 0 : delay, ...args);
  try {
    if (options.stats) env.FORMS_KV = { async get() { return options.statsRecord ? JSON.stringify(options.statsRecord) : null; }, async put(key, value) { puts.push([key, JSON.parse(value)]); } };
    const res = await worker.fetch(req, env, { waitUntil(p) { pending.push(p); } });
    await Promise.all(pending);
    const body = res.status === 204 ? null : await res.json();
    return { res, body, calls, keys, puts, pending };
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; }
}

for (const source of Object.keys(fixtures)) {
  test(`accepted schema: ${source}`, async () => {
    const { res, body, calls } = await run(request(lead(source)));
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls.filter(c => c.url.includes('/sendMessage')).length, 1);
    const verification = JSON.parse(calls[0].init.body);
    assert.equal(verification.remoteip, '203.0.113.8');
    assert.equal(verification.response, 'test-token');
  });
}
for (const page of FORM_SCHEMAS.partner_access_modal.pages) {
  test(`Private Access allowed page: ${page}`, async () => assert.equal((await run(request(lead('partner_access_modal', { page })))).res.status, 200));
}

test('legacy crypto v1 permits omitted amount but still requires consent', async () => {
  const body = lead('crypto_exchange_v2', { page: '/crypto-exchange-v1.html', fields: { contact: '@anna', agree: 'on' } });
  assert.equal((await run(request(body))).res.status, 200);
  delete body.fields.agree;
  const rejected = await run(request(body));
  assert.equal(rejected.res.status, 400);
  assert.equal(rejected.calls.length, 0);
});

const invalidPayloads = [
  ['raw text contract', { text: 'hello 1' }],
  ['null payload', null],
  ['array payload', []],
  ['unknown source', { ...lead(), source: 'unknown' }],
  ['prototype source', { ...lead(), source: 'constructor' }],
  ['unknown page', { ...lead(), page: '/unknown.html' }],
  ['external page', { ...lead(), page: 'https://evil.invalid/' }],
  ['page query', { ...lead(), page: '/?q=1' }],
  ['page hash', { ...lead(), page: '/#a' }],
  ['unknown envelope key', { ...lead(), text: 'arbitrary' }],
  ['unknown field', { ...lead(), fields: { ...fixtures.partner_access_modal, arbitrary: 'x' } }],
  ['object field', { ...lead(), fields: { ...fixtures.partner_access_modal, company: { toString: 'x' } } }],
  ['array field', { ...lead(), fields: { ...fixtures.partner_access_modal, company: ['x'] } }],
  ['boolean consent', { ...lead(), fields: { ...fixtures.partner_access_modal, privacy_agree: true } }],
  ['missing name', { ...lead(), fields: { ...fixtures.partner_access_modal, full_name: '' } }],
  ['whitespace name', { ...lead(), fields: { ...fixtures.partner_access_modal, full_name: '   ' } }],
  ['missing consent', { ...lead(), fields: { ...fixtures.partner_access_modal, privacy_agree: '' } }],
  ['wrong consent', { ...lead(), fields: { ...fixtures.partner_access_modal, privacy_agree: 'on' } }],
  ['invalid email', { ...lead(), fields: { ...fixtures.partner_access_modal, email: 'a@b' } }],
  ['bad channel', { ...lead(), fields: { ...fixtures.partner_access_modal, contact_channel: 'Other' } }],
  ['honeypot', { ...lead(), fields: { ...fixtures.partner_access_modal, _gotcha: 'bot' } }],
  ['control character', { ...lead(), fields: { ...fixtures.partner_access_modal, company: 'bad\u0000' } }],
  ['overlong field', { ...lead(), fields: { ...fixtures.partner_access_modal, company: 'x'.repeat(501) } }],
  ['missing token', { ...lead(), token: undefined }],
  ['empty token', { ...lead(), token: '  ' }],
  ['overlong token', { ...lead(), token: 'x'.repeat(2049) }],
  ['v2 missing amount', lead('crypto_exchange_v2', { fields: { contact: '@anna' } })],
  ['evacuation short contact', lead('evacuation_intake', { fields: { contact: 'tiny' } })],
  ['binary attachment object', lead('pay_lite_intake', { fields: { ...fixtures.pay_lite_intake, file: {} } })],
  ['attachment path', lead('pay_lite_intake', { fields: { ...fixtures.pay_lite_intake, file: '/tmp/invoice.pdf' } })]
];
for (const [label, body] of invalidPayloads) {
  test(`reject without outgoing request: ${label}`, async () => {
    const result = await run(request(body));
    assert.equal(result.res.status, 400);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.body, { ok: false, error: 'invalid_request' });
  });
}

for (const [label, opts, status] of [
  ['missing Origin', { origin: null }, 403], ['foreign Origin', { origin: 'https://evil.invalid' }, 403],
  ['http Origin', { origin: 'http://ccapital.pro' }, 403], ['missing client IP', { ip: null }, 403],
  ['wrong path', { path: '/send' }, 404], ['malformed JSON', { raw: '{' }, 400],
  ['urlencoded old contract', { raw: 'text=hello', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 415],
  ['text/plain', { headers: { 'Content-Type': 'text/plain' } }, 415],
  ['oversized body', { raw: 'x'.repeat(16385) }, 413],
  ['advertised oversized body', { headers: { 'Content-Length': '20000' } }, 413]
]) {
  test(`request boundary: ${label}`, async () => {
    const result = await run(request(lead(), opts));
    assert.equal(result.res.status, status);
    assert.equal(result.calls.length, 0);
    if (opts.origin && opts.origin !== origin) assert.equal(result.res.headers.get('Access-Control-Allow-Origin'), null);
  });
}

test('chunked oversized body is bounded without Content-Length', async () => {
  const bytes = new TextEncoder().encode('x'.repeat(20000));
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 12000)); c.enqueue(bytes.slice(12000)); c.close(); } });
  const result = await run(request(null, { raw: stream, duplex: 'half' }));
  assert.equal(result.res.status, 413);
  assert.equal(result.calls.length, 0);
});

test('invalid UTF-8 rejects before external verification', async () => {
  const result = await run(request(null, { raw: new Uint8Array([0xff, 0xfe]) }));
  assert.equal(result.res.status, 400);
  assert.equal(result.calls.length, 0);
});

for (const [label, verify] of [
  ['failed verification', { success: false }], ['wrong hostname', { success: true, hostname: 'evil.invalid', action: 'lead' }],
  ['wrong action', { success: true, hostname: 'ccapital.pro', action: 'login' }],
  ['reused token', { success: false, 'error-codes': ['timeout-or-duplicate'] }]
]) test(`Turnstile: ${label}`, async () => {
  const result = await run(request(), { verify });
  assert.equal(result.res.status, 403);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls.some(c => c.url.includes('telegram.org')), false);
});

test('www hostname must exactly match Origin', async () => {
  assert.equal((await run(request(lead(), { origin: 'https://www.ccapital.pro' }))).res.status, 200);
  assert.equal((await run(request(lead(), { origin: 'https://www.ccapital.pro' }), { verify: { success: true, hostname: 'ccapital.pro', action: 'lead' } })).res.status, 403);
});

test('verification network failure fails closed', async () => {
  const result = await run(request(), { verifyThrows: true });
  assert.equal(result.res.status, 503);
  assert.equal(result.calls.length, 1);
  assert.equal(JSON.stringify(result.body).includes('private'), false);
});

test('verification timeout fails closed before Telegram', async () => {
  const result = await run(request(), { hang: 'verification' });
  assert.equal(result.res.status, 503);
  assert.equal(result.calls.length, 1);
});

test('Telegram timeout returns a generic delivery failure', async () => {
  const result = await run(request(), { hang: 'telegram' });
  assert.equal(result.res.status, 502);
  assert.deepEqual(result.body, { ok: false, error: 'delivery_failed' });
  assert.equal(result.calls.length, 2);
});

test('IP rate limiting rejects before upstream calls', async () => {
  const result = await run(request(), { rate: false });
  assert.equal(result.res.status, 429);
  assert.deepEqual(result.keys, ['203.0.113.8']);
  assert.equal(result.calls.length, 0);
});

test('missing required binding or secrets fails closed', async () => {
  for (const key of ['FORM_RATE_LIMITER', 'TURNSTILE_SECRET_KEY', 'TG_TOKEN', 'TG_CHAT_ID']) {
    const result = await run(request(), { env: { [key]: undefined } });
    assert.equal(result.res.status, 503, key);
    assert.equal(result.calls.length, 0);
  }
});

test('optional contact limiter receives only a stable contact hash', async () => {
  const keys = [];
  const env = { CONTACT_RATE_LIMITER: { async limit({ key }) { keys.push(key); return { success: false }; } } };
  const result = await run(request(), { env });
  assert.equal(result.res.status, 429);
  assert.match(keys[0], /^[0-9a-f]{64}$/);
  assert.equal(result.calls.length, 1);
});

test('unverified requests cannot exhaust a victim contact quota', async () => {
  let limits = 0;
  const result = await run(request(), { verify: { success: false }, env: {
    CONTACT_RATE_LIMITER: { async limit() { limits++; return { success: true }; } }
  } });
  assert.equal(result.res.status, 403);
  assert.equal(limits, 0);
  assert.equal(result.calls.length, 1);
});

test('server-owned message escapes HTML and includes only filename for attachment', async () => {
  const fields = { ...fixtures.pay_lite_intake, company: '<a href="x">&Company</a>', file: 'invoice.pdf' };
  const result = await run(request(lead('pay_lite_intake', { fields })));
  assert.equal(result.res.status, 200);
  const telegram = JSON.parse(result.calls[1].init.body);
  assert.match(telegram.text, /&lt;a href=&quot;x&quot;&gt;&amp;Company&lt;\/a&gt;/);
  assert.match(telegram.text, /invoice\.pdf/);
  assert.equal(telegram.parse_mode, 'HTML');
  assert.equal(telegram.text.includes('<a href="x">'), false);
});

test('long escaped input is bounded without broken entities or missing contact', async () => {
  const result = await run(request(lead('pay_pro_intake', { fields: { ...fixtures.pay_pro_intake, task: '<'.repeat(2000), docs_have: '&'.repeat(2000) } })));
  assert.equal(result.res.status, 200);
  const text = JSON.parse(result.calls[1].init.body).text;
  assert.ok(text.length <= 4096);
  assert.ok(text.includes('a@example.com'));
  assert.ok(text.includes('https://ccapital.pro/pay.html'));
  assert.equal(/&(?!amp;|lt;|gt;|quot;|#39;)/.test(text), false);
});

for (const [label, options] of [
  ['Telegram HTTP error', { telegramStatus: 502, telegram: { ok: false, description: 'private error' } }],
  ['Telegram body error with HTTP 200', { telegram: { ok: false, description: 'private error' } }],
  ['Telegram malformed body', { telegramRaw: 'private error' }],
  ['Telegram oversized body', { telegramRaw: 'x'.repeat(16385) }],
  ['Telegram network error', { telegramThrows: true }]
]) test(label, async () => {
  const result = await run(request(), options);
  assert.equal(result.res.status, 502);
  assert.deepEqual(result.body, { ok: false, error: 'delivery_failed' });
  assert.equal(JSON.stringify(result.body).includes('mock-token'), false);
});

test('successful delivery schedules private stats and ingest with waitUntil', async () => {
  const result = await run(request(), { stats: true, env: { ORCHESTRATOR_INGEST_URL: 'https://ingest.invalid', ORCHESTRATOR_INGEST_SECRET: 'mock-ingest-secret' } });
  assert.equal(result.res.status, 200);
  assert.equal(result.pending.length, 1);
  assert.equal(result.calls.length, 3);
  assert.equal(result.puts[0][1].forms_today, 1);
  const ingest = JSON.parse(result.calls[2].init.body);
  assert.equal(ingest.contact, 'a@example.com');
  assert.equal(ingest.metadata.form_source, 'partner_access_modal');
});

test('failed Telegram delivery updates error stats and never ingests', async () => {
  const result = await run(request(), { stats: true, telegram: { ok: false }, env: { ORCHESTRATOR_INGEST_URL: 'https://ingest.invalid', ORCHESTRATOR_INGEST_SECRET: 'mock-ingest-secret' } });
  assert.equal(result.res.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.puts[0][1].errors_today, 1);
});

test('health reveals no lead data and never fetches', async () => {
  for (const path of ['/', '/health']) {
    const result = await run(request(null, { method: 'GET', path, origin: null, ip: null }), { stats: true });
    const { ts, ...body } = result.body;
    assert.deepEqual(body, { ok: true, service: 'ccapital-forms-proxy', version: 'lead-v2' });
    assert.ok(Number.isFinite(Date.parse(ts)));
    assert.equal(result.calls.length, 0);
    assert.equal(result.pending.length, 0);
  }
});

test('health preserves only existing aggregate monitoring fields', async () => {
  const statsRecord = { day: '2026-11-05', forms_today: 7, errors_today: 1, errors_24h: 1,
    last_form_at: '2026-11-05T10:00:00.000Z', contact: 'private@example.com', leads: ['private'], token: 'secret' };
  const result = await run(request(null, { method: 'GET', path: '/health', origin: null, ip: null }), { stats: true, statsRecord });
  for (const key of ['day', 'forms_today', 'errors_today', 'errors_24h', 'last_form_at']) assert.equal(result.body[key], statsRecord[key]);
  for (const key of ['contact', 'leads', 'token']) assert.equal(Object.hasOwn(result.body, key), false);
});

test('preflight is restricted to the expected Origin and endpoint', async () => {
  assert.equal((await run(request(null, { method: 'OPTIONS' }))).res.status, 204);
  assert.equal((await run(request(null, { method: 'OPTIONS', origin: null }))).res.status, 403);
  assert.equal((await run(request(null, { method: 'OPTIONS', origin: 'https://evil.invalid' }))).res.status, 403);
  assert.equal((await run(request(null, { method: 'OPTIONS', path: '/health' }))).res.status, 404);
});
