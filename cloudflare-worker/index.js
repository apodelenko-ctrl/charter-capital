/*!
 * Charter Capital · Forms-to-Telegram proxy (Cloudflare Worker)
 * -------------------------------------------------------------
 * Принимает текст заявки от фронтенда и пересылает в Telegram-бот.
 * Токен бота хранится в секрете воркера (env.TG_TOKEN) и НИКОГДА не попадает
 * в публичный JS сайта — это и есть весь смысл прокси.
 *
 * Секреты/переменные (ставятся через wrangler, см. README.md):
 *   TG_TOKEN   — токен бота из @BotFather  (секрет)
 *   TG_CHAT_ID — chat_id получателя заявок  (переменная)
 *
 * Origin-allowlist отсекает кросс-сайтовый абуз из браузера. Это не жёсткая
 * граница безопасности (Origin можно подделать вне браузера), но главное —
 * утечка токена больше невозможна, поэтому бота нельзя переименовать/угнать.
 */

const ALLOWED_ORIGINS = [
  'https://ccapital.pro',
  'https://www.ccapital.pro'
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

async function readStats(env) {
  try {
    const raw = await env.FORMS_KV.get('stats');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

async function bumpStats(env, ok) {
  if (!env.FORMS_KV) return;
  const s = await readStats(env);
  const day = new Date().toISOString().slice(0, 10);
  if (s.day !== day) { s.day = day; s.forms_today = 0; s.errors_today = 0; }
  s.last_form_at = new Date().toISOString();
  if (ok) s.forms_today = (s.forms_today || 0) + 1;
  else s.errors_today = (s.errors_today || 0) + 1;
  s.errors_24h = s.errors_today;
  await env.FORMS_KV.put('stats', JSON.stringify(s));
}

async function ctxWaitIngest(env, text) {
  const base = String(env.ORCHESTRATOR_INGEST_URL || '').replace(/\/$/, '');
  if (!base) return;
  await fetch(`${base}/api/ingest/lead`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ORCHESTRATOR_INGEST_SECRET}`,
    },
    body: JSON.stringify({
      system_id: 'charter-forms-proxy',
      title: text.slice(0, 120),
      contact: (text.match(/\+?\d[\d\s-]{8,}/) || [])[0] || undefined,
      source: 'ccapital_forms',
      metadata: { telegram_text: text.slice(0, 800) },
    }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Health для Control Tower (без CORS-ограничений на GET)
    if (request.method === 'GET' && (path === '/health' || path === '/')) {
      const stats = env.FORMS_KV ? await readStats(env) : {};
      return new Response(JSON.stringify({
        ok: true,
        service: 'ccapital-forms-proxy',
        ts: new Date().toISOString(),
        ...stats
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }
    if (origin && ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    let text = '';
    const ct = request.headers.get('Content-Type') || '';
    try {
      if (ct.indexOf('application/json') !== -1) {
        const j = await request.json();
        text = String((j && j.text) || '');
      } else {
        const f = await request.formData();
        text = String(f.get('text') || '');
      }
    } catch (_) { /* no-op */ }

    text = text.trim();
    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: 'empty' }), {
        status: 400,
        headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
      });
    }
    if (text.length > 4096) text = text.slice(0, 4096);

    const tgRes = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const body = await tgRes.text();
    await bumpStats(env, tgRes.ok);

    if (tgRes.ok && env.ORCHESTRATOR_INGEST_URL && env.ORCHESTRATOR_INGEST_SECRET) {
      ctxWaitIngest(env, text).catch(() => {});
    }

    return new Response(body, {
      status: tgRes.ok ? 200 : 502,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
    });
  }
};
