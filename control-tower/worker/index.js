/**
 * Charter Capital · Control Tower — агрегирующий Worker.
 * Статика + /api/* (Basic auth через DASHBOARD_SECRET).
 *
 * Секреты: wrangler secret put DASHBOARD_SECRET
 *          wrangler secret put GITHUB_TOKEN
 *          wrangler secret put INDEXNOW_KEY
 *          wrangler secret put ADMIN_KEY  (тот же, что у charter-chat /admin)
 */

import { BLOCKS, UNITS } from "./units.js";
import { handleTasksApi } from "./tasks.js";

const REPO = "apodelenko-ctrl/charter-capital";
const LIVE = "https://ccapital.pro";
const FORMS_HEALTH = "https://ccapital-forms-proxy.wegc.workers.dev/health";
const CHAT_HEALTH = "https://charter-chat.wegc.workers.dev/health";
const CHAT_STATS = "https://charter-chat.wegc.workers.dev/health/stats";
const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";
const DEFAULT_INDEXNOW_URLS = [
  `${LIVE}/`,
  `${LIVE}/journal.html`,
  `${LIVE}/private.html`,
  `${LIVE}/pay.html`,
  `${LIVE}/diagnostic.html`,
  `${LIVE}/freedom-route.html`,
];

// ── helpers ────────────────────────────────────────────────────────────────

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Charter Control Tower"' },
  });
}

function checkAuth(request, env) {
  const secret = env.DASHBOARD_SECRET;
  if (!secret) return true; // dev без секрета
  const h = request.headers.get("Authorization") || "";
  if (h === `Bearer ${secret}`) return true;
  if (h.startsWith("Basic ")) {
    try {
      const decoded = atob(h.slice(6));
      const pass = decoded.split(":").slice(1).join(":");
      if (pass === secret) return true;
    } catch (_) {}
  }
  const url = new URL(request.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

async function logEvent(env, type, message, meta = {}) {
  if (!env.TOWER_KV) return;
  const entry = { ts: new Date().toISOString(), type, message, ...meta };
  const key = `log:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await env.TOWER_KV.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function getLogs(env, limit = 50) {
  if (!env.TOWER_KV) return [];
  const list = await env.TOWER_KV.list({ prefix: "log:", limit: 200 });
  const items = [];
  for (const k of list.keys.slice(-limit).reverse()) {
    const v = await env.TOWER_KV.get(k.name);
    if (v) try { items.push(JSON.parse(v)); } catch (_) {}
  }
  return items;
}

async function gh(env, path, opts = {}) {
  const token = env.GITHUB_TOKEN;
  if (!token) return { error: "GITHUB_TOKEN not set" };
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "ccapital-control-tower",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) return { error: `GitHub ${res.status}`, body: await res.text() };
  return res.json();
}

async function ghFileText(env, filePath) {
  const data = await gh(env, `/repos/${REPO}/contents/${filePath}`);
  if (data.error || !data.content) return null;
  return atob(data.content.replace(/\n/g, ""));
}

async function fetchJsonSafe(url, opts = {}, fetcher = null) {
  try {
    const doFetch = fetcher ? fetcher.fetch.bind(fetcher) : fetch;
    const r = await doFetch(url, { ...opts, signal: AbortSignal.timeout(12000) });
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) return { ok: r.ok, status: r.status, data: await r.json() };
    return { ok: r.ok, status: r.status, data: await r.text() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function trafficLight(status) {
  if (status === "green") return { color: "green", label: "OK" };
  if (status === "yellow") return { color: "yellow", label: "Внимание" };
  if (status === "red") return { color: "red", label: "Сбой" };
  if (status === "gray") return { color: "gray", label: "Выкл" };
  return { color: "gray", label: "—" };
}

// ── health probes ──────────────────────────────────────────────────────────

async function probeDeploy(env) {
  const runs = await gh(env, `/repos/${REPO}/actions/runs?per_page=5`);
  if (runs.error) return { status: "yellow", detail: runs.error };
  const run = (runs.workflow_runs || []).find((r) => r.name?.includes("pages") || r.head_branch === "gh-pages")
    || runs.workflow_runs?.[0];
  if (!run) return { status: "yellow", detail: "Нет runs в Actions API" };
  const ok = run.conclusion === "success";
  const pending = run.status !== "completed";
  return {
    status: pending ? "yellow" : ok ? "green" : "red",
    last_run_at: run.updated_at,
    conclusion: run.conclusion,
    url: run.html_url,
    detail: `${run.status} / ${run.conclusion || "—"}`,
  };
}

async function probeIndexNowKey(env) {
  const key = env.INDEXNOW_KEY;
  if (!key) return { status: "yellow", detail: "INDEXNOW_KEY не задан" };
  const url = `${LIVE}/${key}.txt`;
  const r = await fetchJsonSafe(url);
  const body = typeof r.data === "string" ? r.data.trim() : "";
  const ok = r.ok && body === key;
  return { status: ok ? "green" : "red", key_url: url, detail: ok ? "Ключ доступен" : "Ключ недоступен" };
}

async function probeDzenFeed() {
  const r = await fetch(`${LIVE}/journal/feed.xml`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { status: "red", detail: `feed HTTP ${r.status}` };
  const xml = await r.text();
  const items = (xml.match(/<item>/g) || []).length;
  const hasContent = xml.includes("content:encoded");
  return {
    status: items > 0 && hasContent ? "green" : "yellow",
    items,
    has_content_encoded: hasContent,
    detail: `${items} items`,
  };
}

async function probeFormsProxy(env) {
  const r = await fetchJsonSafe(FORMS_HEALTH, {}, env.FORMS);
  const ok = r.ok && (r.data?.ok || r.data === "OK" || String(r.data).includes("OK"));
  return {
    status: ok ? "green" : "red",
    detail: r.data?.service || r.error || r.status,
    last_form_at: r.data?.last_form_at,
    errors_24h: r.data?.errors_24h,
  };
}

async function probeCharterChat(env) {
  const r = await fetchJsonSafe(CHAT_HEALTH, {}, env.CHAT);
  const ok = r.ok && r.data?.ok;
  let stats = {};
  if (env.ADMIN_KEY) {
    const s = await fetchJsonSafe(`${CHAT_STATS}?key=${encodeURIComponent(env.ADMIN_KEY)}`, {}, env.CHAT);
    if (s.ok && s.data) stats = s.data;
  }
  return {
    status: ok ? "green" : "red",
    detail: r.data?.service || "charter-chat",
    ...stats,
  };
}

async function probeCharterFlowLive() {
  const r = await fetch(`${LIVE}/charter-flow/`, { method: "HEAD", signal: AbortSignal.timeout(10000) });
  return { status: r.ok ? "green" : "red", detail: r.ok ? "charter-flow live" : `HTTP ${r.status}` };
}

async function probeLiveSite() {
  const r = await fetch(LIVE, { method: "HEAD", signal: AbortSignal.timeout(10000) });
  return {
    status: r.ok ? "green" : "red",
    last_modified: r.headers.get("last-modified"),
    detail: r.ok ? "ccapital.pro отвечает" : `HTTP ${r.status}`,
  };
}

async function listDrafts(env, prefix) {
  const data = await gh(env, `/repos/${REPO}/contents/drafts${prefix ? `/${prefix}` : ""}`);
  if (data.error || !Array.isArray(data)) return [];
  return data.filter((f) => f.type === "file").map((f) => ({
    name: f.name, path: f.path, updated: f.sha?.slice(0, 7),
  }));
}

async function probeDirectCsv(env) {
  const files = ["all-campaigns.csv", "campaign-1-zarubezhnye-scheta.csv"];
  let ok = 0;
  for (const f of files) {
    const d = await gh(env, `/repos/${REPO}/contents/direct-import/${f}`);
    if (!d.error) ok++;
  }
  return { status: ok >= 2 ? "green" : "yellow", csv_files: ok, detail: `${ok} CSV в репо` };
}

function parseContentKanban(md) {
  if (!md) return { published: [], planned: [], metrics: {} };
  const published = [];
  const planned = [];
  for (const line of md.split("\n")) {
    if (line.includes("| ● |") || line.includes("|●|")) {
      const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) published.push({ num: parts[0], title: parts[2], url: parts[3] || "" });
    }
    if (line.includes("| P1 |") || line.includes("| P2 |") || line.includes("| P3 |")) {
      const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 4) planned.push({ priority: parts[1], slug: parts[2], title: parts[3] });
    }
  }
  return { published, planned };
}

async function unitHealth(env, unit) {
  switch (unit.health) {
    case "github_actions": return probeDeploy(env);
    case "indexnow": return probeIndexNowKey(env);
    case "dzen_feed": return probeDzenFeed();
    case "forms_proxy": return probeFormsProxy(env);
    case "charter_chat": return probeCharterChat(env);
    case "charter_flow_live": return probeCharterFlowLive();
    case "direct_csv": return probeDirectCsv(env);
    case "drafts_tg": {
      const files = await listDrafts(env, "");
      const tg = files.filter((f) => f.name.startsWith("tg-"));
      return { status: tg.length ? "green" : "yellow", drafts: tg.length, files: tg };
    }
    case "drafts_vc": {
      const files = await listDrafts(env, "");
      const vc = files.filter((f) => f.name.startsWith("vc-"));
      return { status: vc.length ? "green" : "yellow", drafts: vc.length, files: vc };
    }
    case "drafts_reels": {
      const files = await listDrafts(env, "reels");
      return { status: files.length ? "green" : "yellow", drafts: files.length, files };
    }
    case "content_kanban": {
      const md = await ghFileText(env, "drafts/content-anchor-map.md");
      const kanban = parseContentKanban(md);
      return {
        status: kanban.published.length >= 7 ? "green" : "yellow",
        published: kanban.published.length,
        planned: kanban.planned.length,
        kanban,
      };
    }
    default:
      return { status: "gray", detail: "Ручной контроль" };
  }
}

// ── actions ────────────────────────────────────────────────────────────────

async function actionIndexNow(env, mode = "default", urls = []) {
  const key = env.INDEXNOW_KEY;
  if (!key) throw new Error("INDEXNOW_KEY not configured");
  let urlList = urls.length ? urls : DEFAULT_INDEXNOW_URLS;
  if (mode === "recent") {
    const commit = await gh(env, `/repos/${REPO}/commits/main`);
    if (commit.files) {
      urlList = commit.files
        .filter((f) => f.filename.endsWith(".html") && !f.filename.startsWith("yandex_"))
        .map((f) => (f.filename === "index.html" ? `${LIVE}/` : `${LIVE}/${f.filename}`));
    }
  }
  if (!urlList.length) throw new Error("No URLs to ping");
  const body = JSON.stringify({
    host: "ccapital.pro",
    key,
    keyLocation: `${LIVE}/${key}.txt`,
    urlList,
  });
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  await logEvent(env, "indexnow", `Ping ${urlList.length} URL → HTTP ${res.status}`, { urls: urlList.length });
  return { ok: res.status === 200 || res.status === 202, status: res.status, url_count: urlList.length, urls: urlList };
}

async function actionWorkflow(env, action) {
  const r = await gh(env, `/repos/${REPO}/actions/workflows/control-tower-actions.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { action } }),
  });
  if (r.error) throw new Error(r.error + (r.body ? `: ${r.body}` : ""));
  await logEvent(env, "workflow", `Triggered ${action}`);
  return { ok: true, action };
}

// ── API routes ─────────────────────────────────────────────────────────────

async function handleApi(request, env, path, method) {
  if (path === "/api/health") {
    return json({ ok: true, service: "ccapital-control-tower", ts: new Date().toISOString() });
  }

  const tasksResp = await handleTasksApi(request, env, path, method, checkAuth);
  if (tasksResp) return tasksResp;

  if (!checkAuth(request, env)) return unauthorized();

  if (path === "/api/overview" && method === "GET") {
    const live = await probeLiveSite();
    const deploy = await probeDeploy(env);
    const units = [];
    for (const u of UNITS) {
      const h = await unitHealth(env, u);
      units.push({ ...u, health: h, ...trafficLight(h.status) });
    }
    const green = units.filter((u) => u.color === "green").length;
    const red = units.filter((u) => u.color === "red").length;
    const gray = units.filter((u) => u.color === "gray").length;
    return json({
      site: live,
      deploy,
      summary: { total: units.length, green, yellow: units.length - green - red - gray, red, gray },
      blocks: BLOCKS,
      units,
    });
  }

  if (path === "/api/logs" && method === "GET") {
    return json({ logs: await getLogs(env) });
  }

  if (path === "/api/content/kanban" && method === "GET") {
    const md = await ghFileText(env, "drafts/content-anchor-map.md");
    return json(parseContentKanban(md));
  }

  if (path === "/api/drafts" && method === "GET") {
    const root = await listDrafts(env, "");
    const reels = await listDrafts(env, "reels");
    return json({
      tg: root.filter((f) => f.name.startsWith("tg-")),
      vc: root.filter((f) => f.name.startsWith("vc-")),
      reels,
      other: root.filter((f) => !f.name.startsWith("tg-") && !f.name.startsWith("vc-")),
    });
  }

  if (path === "/api/leads" && method === "GET") {
    const chat = await probeCharterChat(env);
    let leads = [];
    if (env.ADMIN_KEY) {
      const stats = await fetchJsonSafe(`${CHAT_STATS}?key=${encodeURIComponent(env.ADMIN_KEY)}`, {}, env.CHAT);
      if (stats.data?.recent) leads = stats.data.recent;
    }
    return json({ chat, leads });
  }

  if (path === "/api/traffic" && method === "GET") {
    let manual = {};
    if (env.TOWER_KV) {
      const raw = await env.TOWER_KV.get("traffic:manual");
      if (raw) try { manual = JSON.parse(raw); } catch (_) {}
    }
    return json({ source: "manual", note: "Подключите Директ API или вводите вручную", ...manual });
  }

  if (path === "/api/traffic" && method === "POST") {
    const body = await request.json();
    if (env.TOWER_KV) await env.TOWER_KV.put("traffic:manual", JSON.stringify(body));
    return json({ ok: true });
  }

  if (path === "/api/dzen" && method === "GET") {
    const feed = await probeDzenFeed();
    return json({
      feed,
      channel: "@charter_capital",
      channel_id: "6a18826b19b0122c2924f370",
      subscribers_goal: 10,
      note: "RSS-импорт доступен при ≥10 подписчиках",
    });
  }

  if (path === "/api/actions/indexnow" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    try {
      const result = await actionIndexNow(env, body.mode || "default", body.urls || []);
      return json(result);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }

  if (path === "/api/actions/deploy" && method === "POST") {
    try {
      return json(await actionWorkflow(env, "deploy"));
    } catch (e) {
      return json({ ok: false, error: e.message, hint: "Добавьте workflow control-tower-actions.yml + GITHUB_TOKEN" }, 500);
    }
  }

  if (path === "/api/actions/rebuild-dzen-feed" && method === "POST") {
    try {
      return json(await actionWorkflow(env, "rebuild_dzen_feed"));
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }

  if (path === "/api/actions/regenerate-direct" && method === "POST") {
    try {
      return json(await actionWorkflow(env, "regenerate_direct"));
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

// ── entry ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.startsWith("/api")) {
      return handleApi(request, env, path, request.method);
    }

    if (path === "/tasks") {
      return Response.redirect(`${url.origin}/#tasks`, 302);
    }

    // Публичная страница логина — без секрета в HTML; API всё равно за auth
    if (env.ASSETS) {
      if (path === "/") path = "/index.html";
      return env.ASSETS.fetch(new URL(path, url.origin));
    }
    return new Response("Control Tower — assets not bound", { status: 503 });
  },
};
