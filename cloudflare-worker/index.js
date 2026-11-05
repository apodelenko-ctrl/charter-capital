/* Charter Capital: validated website leads, never a public Telegram text relay. */

const ALLOWED_ORIGINS = new Set(['https://ccapital.pro', 'https://www.ccapital.pro']);
const MAX_BODY_BYTES = 16 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_FIELDS = ['email', 'contact', 'telegram', 'phone', 'tg', 'messenger'];

function schema(title, pages, fields, required, consent = {}) {
  return Object.freeze({ title, pages, fields: [...fields.split(','), '_gotcha'], required: required.split(','), consent });
}

// Keep the browser's allowlist and the HTML forms in sync with these schemas.
export const FORM_SCHEMAS = Object.freeze({
  partner_access_modal: schema('🔐 Private Access', ['/', '/index.html', '/private.html', '/homeland.html', '/slovakia.html'],
    'email,full_name,company,phone,telegram,contact_channel,privacy_agree', 'email,full_name,contact_channel,privacy_agree', { privacy_agree: 'yes' }),
  property_ru: schema('🏠 Property · RU', ['/property.html'],
    'name,email,phone,budget,project,message,agree', 'name,email,agree', { agree: 'on' }),
  property_en: schema('🏠 Property · EN', ['/property-en.html'],
    'name,email,phone,budget,project,message,agree', 'name,email,agree', { agree: 'on' }),
  pay_usdc_b2b: schema('💼 Pay · USDC B2B', ['/pay.html'],
    'name,contact,supplier_country', 'name,contact,supplier_country'),
  pay_lite_intake: schema('⚡ Pay Lite', ['/pay.html'],
    'company,jurisdiction,reg_id,contact,messenger,email,benef_country,benef_name,amount,currency,purpose,invoice,file,deadline,comment',
    'company,jurisdiction,reg_id,contact,email,benef_country,benef_name,amount,currency,purpose'),
  pay_pro_intake: schema('🎯 Pay Pro', ['/pay.html'],
    'task,amount,currency,principal_country,benef_country,benef_type,contract,invoice,route_used,bank_q,docs_have,messenger,email,deadline,comment',
    'task,amount,currency,principal_country,benef_country,benef_type,email'),
  slovakia_intake: schema('🇸🇰 Slovakia', ['/slovakia.html'],
    'name,contact,citz,where,biz,rev,prof,emp,roots,docs,fam,when,msg', 'name,contact'),
  crypto_exchange_v2: schema('⚡ Crypto Exchange · RUB → Crypto', ['/crypto-exchange.html', '/crypto-exchange-v2.html', '/crypto-exchange-v1.html'],
    'amount,asset,purpose,contact,task,company,comment,agree', 'contact'),
  company_intake: schema('🏢 Компания за рубежом', ['/company.html'],
    'name,email,goal,tg,message,agree', 'name,email,agree', { agree: 'on' }),
  evacuation_intake: schema('🚨 Эвакуация капитала · срочная заявка', ['/evacuation.html'],
    'situation,volume,contact,message', 'contact')
});

const LABELS = {
  name: 'Имя', full_name: 'ФИО', email: 'Email', contact: 'Контакт', company: 'Компания',
  phone: 'Телефон', telegram: 'Telegram', tg: 'Telegram / телефон', messenger: 'Telegram / WhatsApp',
  contact_channel: 'Предпочтительный канал', privacy_agree: 'Согласие на обработку', agree: 'Согласие на обработку',
  budget: 'Бюджет', project: 'Проект', message: 'Сообщение', supplier_country: 'Страна поставщика',
  jurisdiction: 'Юрисдикция компании', reg_id: 'ИНН / Reg. number', benef_country: 'Страна получателя',
  benef_name: 'Получатель', amount: 'Сумма', currency: 'Валюта', purpose: 'Назначение', invoice: 'Инвойс',
  file: 'Файл (название)', deadline: 'Желаемый срок', comment: 'Комментарий', task: 'Описание задачи',
  principal_country: 'Страна вашей компании', benef_type: 'Тип получателя', contract: 'Контракт',
  route_used: 'Маршрут', bank_q: 'Вопрос банка-получателя', docs_have: 'Имеющиеся документы',
  citz: 'Гражданство', where: 'Где сейчас живёте', biz: 'Бизнес / источник дохода', rev: 'Годовой оборот',
  prof: 'Профессия', emp: 'Оффер от SK-работодателя', roots: 'Предки в ЧСФР / SK', docs: 'Документы',
  fam: 'С семьёй', when: 'Когда начать', msg: 'Что важно понять', asset: 'Актив', goal: 'Задача',
  situation: 'Ситуация', volume: 'Объём'
};

class Rejection extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function response(status, code, origin, extra = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...extra };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(status < 400 ? { ok: true } : { ok: false, error: code }), { status, headers });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('Content-Type') || '')) {
    throw new Rejection(415, 'unsupported_media_type');
  }
  const advertised = request.headers.get('Content-Length');
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_BODY_BYTES)) {
    throw new Rejection(413, 'payload_too_large');
  }
  if (!request.body) throw new Rejection(400, 'invalid_request');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Rejection(413, 'payload_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (_) { throw new Rejection(400, 'invalid_request'); }
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function validateLead(body) {
  if (!isRecord(body) || Object.keys(body).some(k => !['source', 'page', 'fields', 'token'].includes(k))) {
    throw new Rejection(400, 'invalid_request');
  }
  const { source, page, fields, token } = body;
  if (typeof source !== 'string' || !Object.hasOwn(FORM_SCHEMAS, source)) throw new Rejection(400, 'invalid_request');
  const definition = FORM_SCHEMAS[source];
  if (typeof page !== 'string' || !definition.pages.includes(page) || !isRecord(fields)) throw new Rejection(400, 'invalid_request');
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) throw new Rejection(400, 'invalid_request');
  const normalized = Object.create(null);
  for (const [key, value] of Object.entries(fields)) {
    if (!definition.fields.includes(key) || typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new Rejection(400, 'invalid_request');
    }
    const max = ['message', 'comment', 'task', 'docs_have', 'msg'].includes(key) ? 2000 : 500;
    if (value.length > max) throw new Rejection(400, 'invalid_request');
    normalized[key] = value.trim();
  }
  if (normalized._gotcha) throw new Rejection(400, 'invalid_request');
  if (definition.required.some(key => !normalized[key])) throw new Rejection(400, 'invalid_request');
  for (const [key, expected] of Object.entries(definition.consent)) {
    if (normalized[key] !== expected) throw new Rejection(400, 'invalid_request');
  }
  if (normalized.email && (normalized.email.length > 254 || !EMAIL.test(normalized.email))) throw new Rejection(400, 'invalid_request');
  if (source === 'partner_access_modal' && !['Email', 'Telegram', 'Телефон', 'WhatsApp'].includes(normalized.contact_channel)) {
    throw new Rejection(400, 'invalid_request');
  }
  if (source === 'crypto_exchange_v2') {
    if (page === '/crypto-exchange-v1.html' ? normalized.agree !== 'on' : !normalized.amount) throw new Rejection(400, 'invalid_request');
  }
  if (source === 'evacuation_intake' && normalized.contact.length < 5) throw new Rejection(400, 'invalid_request');
  if (normalized.file && (/[\\/]/.test(normalized.file) || normalized.file.length > 255)) throw new Rejection(400, 'invalid_request');
  return { source, page, fields: normalized, token: token.trim(), definition };
}

function renderMessage(lead, origin) {
  const fields = Object.entries(lead.fields).filter(([key, value]) => key !== '_gotcha' && value);
  // Contact remains visible even if a long description is shortened for Telegram.
  fields.sort(([a], [b]) => Number(CONTACT_FIELDS.includes(b)) - Number(CONTACT_FIELDS.includes(a)));
  const footer = `\n\n🌐 ${origin}${lead.page}\n🕐 ${new Date().toISOString()}`;
  let text = `<b>Новая заявка — ${lead.definition.title}</b>\n`;
  for (const [key, value] of fields) {
    const prefix = `\n<b>${LABELS[key] || key}:</b> `;
    const available = 4096 - text.length - footer.length - prefix.length;
    if (available < 5) break;
    let escaped = '';
    for (const char of value) {
      const next = escapeHtml(char);
      if (escaped.length + next.length > available - 1) { escaped += '…'; break; }
      escaped += next;
    }
    text += prefix + escaped;
  }
  return text + footer;
}

async function fetchJson(url, options, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const result = await fetch(url, { ...options, signal: controller.signal });
    // Both upstream APIs return small JSON; bound unexpected upstream bodies too.
    const body = await readJson(new Request('https://local.invalid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: result.body, duplex: 'half'
    }));
    return { ok: result.ok, body };
  } finally { clearTimeout(timer); }
}

async function enforceLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') throw new Rejection(503, 'unavailable');
  const result = await binding.limit({ key });
  if (!result || result.success !== true) throw new Rejection(429, 'rate_limited');
}

async function contactKey(lead) {
  const value = CONTACT_FIELDS.map(key => lead.fields[key]).find(Boolean);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.toLowerCase()));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function bumpStats(env, ok) {
  if (!env.FORMS_KV) return;
  const raw = await env.FORMS_KV.get('stats');
  const s = raw ? JSON.parse(raw) : {};
  const day = new Date().toISOString().slice(0, 10);
  if (s.day !== day) { s.day = day; s.forms_today = 0; s.errors_today = 0; }
  s.last_form_at = new Date().toISOString();
  if (ok) s.forms_today = (s.forms_today || 0) + 1;
  else s.errors_today = (s.errors_today || 0) + 1;
  s.errors_24h = s.errors_today;
  await env.FORMS_KV.put('stats', JSON.stringify(s));
}

async function healthStats(env) {
  if (!env.FORMS_KV) return {};
  try {
    const s = JSON.parse(await env.FORMS_KV.get('stats') || '{}');
    if (!isRecord(s)) return {};
    const aggregate = {};
    for (const key of ['forms_today', 'errors_today', 'errors_24h']) {
      if (Number.isFinite(s[key]) && s[key] >= 0) aggregate[key] = s[key];
    }
    if (typeof s.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.day)) aggregate.day = s.day;
    if (typeof s.last_form_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s.last_form_at) && Number.isFinite(Date.parse(s.last_form_at))) {
      aggregate.last_form_at = s.last_form_at;
    }
    return aggregate;
  } catch (_) { return {}; }
}

async function ingestLead(env, lead, text) {
  if (!env.ORCHESTRATOR_INGEST_URL || !env.ORCHESTRATOR_INGEST_SECRET) return;
  const base = String(env.ORCHESTRATOR_INGEST_URL).replace(/\/$/, '');
  await fetchJson(`${base}/api/ingest/lead`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ORCHESTRATOR_INGEST_SECRET}` },
    body: JSON.stringify({
      system_id: 'charter-forms-proxy', title: lead.definition.title,
      contact: CONTACT_FIELDS.map(key => lead.fields[key]).find(Boolean), source: 'ccapital_forms',
      metadata: { form_source: lead.source, page: lead.page, telegram_text: text.slice(0, 800) }
    })
  });
}

async function recordOutcome(env, ctx, ok, lead, text) {
  const jobs = [bumpStats(env, ok)];
  if (ok) jobs.push(ingestLead(env, lead, text));
  const pending = Promise.all(jobs).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pending);
  else await pending;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      return new Response(JSON.stringify({ ok: true, service: 'ccapital-forms-proxy', version: 'lead-v2', ts: new Date().toISOString(), ...await healthStats(env) }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
    if (path !== '/') return response(404, 'not_found', origin);
    if (!ALLOWED_ORIGINS.has(origin)) return response(403, 'forbidden', origin);
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
    });
    if (request.method !== 'POST') return response(405, 'method_not_allowed', origin, { Allow: 'POST, OPTIONS' });
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip || ip.length > 64 || !/^[\da-fA-F:.]+$/.test(ip)) throw new Rejection(403, 'forbidden');
      await enforceLimit(env.FORM_RATE_LIMITER, ip);
      const lead = validateLead(await readJson(request));
      if (!env.TURNSTILE_SECRET_KEY || !env.TG_TOKEN || !env.TG_CHAT_ID) throw new Rejection(503, 'unavailable');
      let verification;
      try {
        verification = await fetchJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: lead.token, remoteip: ip })
        });
      } catch (_) { throw new Rejection(503, 'unavailable'); }
      if (!verification.ok || verification.body.success !== true || verification.body.hostname !== new URL(origin).hostname || verification.body.action !== 'lead') {
        throw new Rejection(403, 'verification_failed');
      }
      // Unverified callers must not consume another person's contact quota.
      if (env.CONTACT_RATE_LIMITER) await enforceLimit(env.CONTACT_RATE_LIMITER, await contactKey(lead));
      const text = renderMessage(lead, origin);
      let delivered = false;
      try {
        const telegram = await fetchJson(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        delivered = telegram.ok && telegram.body.ok === true;
      } catch (_) { /* Upstream details and secret-bearing URLs never reach the browser. */ }
      await recordOutcome(env, ctx, delivered, lead, text);
      return response(delivered ? 200 : 502, 'delivery_failed', origin);
    } catch (error) {
      return response(error instanceof Rejection ? error.status : 503, error instanceof Rejection ? error.code : 'unavailable', origin);
    }
  }
};
