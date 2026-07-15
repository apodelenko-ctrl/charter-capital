const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let SECRET = localStorage.getItem("cc_tower_secret") || "";
let overview = null;
let panel = "overview";

function toast(msg, ms = 3500) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, ms);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    $("#gate").hidden = false;
    $("#app").hidden = true;
    throw new Error("Нужен DASHBOARD_SECRET");
  }
  if (!r.ok) throw new Error(data.error || data.detail?.error || r.statusText);
  return data;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function dot(color) {
  return `<span class="dot ${color}"></span>`;
}

async function loadOverview() {
  overview = await api("/api/overview");
  return overview;
}

function renderOverview() {
  const o = overview;
  const s = o.summary || {};
  $("#panel").innerHTML = `
    <div class="grid grid-3 section">
      <div class="card card-gold"><div class="meta">Юнитов OK</div><div class="val">${s.green || 0}/${s.total || 0}</div></div>
      <div class="card"><div class="meta">Сайт</div><div class="val" style="font-size:.95rem">${dot(o.site?.status === "green" ? "green" : "red")}live</div>
        <div class="meta">${o.site?.last_modified || ""}</div></div>
      <div class="card"><div class="meta">Deploy</div><div class="val" style="font-size:.95rem">${dot(o.deploy?.status === "green" ? "green" : o.deploy?.status === "yellow" ? "yellow" : "red")}${o.deploy?.conclusion || "—"}</div>
        <div class="meta">${fmtTime(o.deploy?.last_run_at)}</div></div>
    </div>
    ${(o.blocks || []).map(block => `
      <div class="section">
        <div class="section-title">${block.icon} ${block.title}</div>
        ${(o.units || []).filter(u => u.block === block.id).map(u => `
          <div class="unit ${u.color}">
            <div class="unit-name">${dot(u.color)}${u.name}</div>
            <div class="unit-does">${u.does} · ${u.health?.detail || u.label}</div>
            ${u.health?.last_run_at ? `<div class="meta">${fmtTime(u.health.last_run_at)}</div>` : ""}
          </div>`).join("")}
      </div>`).join("")}`;
}

function renderPublish() {
  const o = overview;
  $("#panel").innerHTML = `
    <div class="section">
      <div class="section-title">Публикация · SEO</div>
      <div class="card card-gold">
        <h3>Deploy · GitHub Pages</h3>
        <div class="meta">${o.deploy?.detail || "—"} · ${fmtTime(o.deploy?.last_run_at)}</div>
        ${o.deploy?.url ? `<div class="meta"><a class="link-gold" href="${o.deploy.url}" target="_blank">Actions run ↗</a></div>` : ""}
        <div class="actions">
          <button class="btn" data-act="deploy">Deploy now</button>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>IndexNow</h3>
        <div class="meta">Яндекс/Bing · ключ на ccapital.pro</div>
        <div class="actions">
          <button class="btn secondary" data-act="indexnow-default">Ping default</button>
          <button class="btn secondary" data-act="indexnow-recent">Ping recent</button>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Dzen feed</h3>
        <div class="meta">journal/feed.xml · content:encoded</div>
        <div class="actions">
          <button class="btn secondary" data-act="rebuild-dzen">Rebuild feed</button>
        </div>
      </div>
    </div>`;
  bindActions();
}

async function renderLeads() {
  const d = await api("/api/leads");
  $("#panel").innerHTML = `
    <div class="grid grid-2 section">
      <div class="card"><h3>Forms → Telegram</h3>
        <div class="val" style="font-size:1rem">${dot(d.chat?.status === "green" ? "green" : "red")}proxy</div>
        <div class="meta">forms-proxy · ${d.chat?.detail || ""}</div></div>
      <div class="card card-gold"><h3>AI-чат «Артур»</h3>
        <div class="val">${d.chat?.dialogs_24h ?? d.chat?.leads_today ?? "—"}</div>
        <div class="meta">диалогов / лидов за 24ч</div></div>
    </div>
    <div class="section">
      <div class="section-title">Последние лиды (D1)</div>
      <div class="card" style="overflow:auto">
        <table><thead><tr><th>Время</th><th>Канал</th><th>Контакт</th><th>Запрос</th><th>Статус</th></tr></thead>
        <tbody>${(d.leads || []).map(r => `<tr>
          <td>${fmtTime(r.updated_at)}</td><td>${r.channel||""}</td><td>${r.contact||""}</td>
          <td>${(r.need||"").slice(0,60)}</td><td>${r.status||""}</td></tr>`).join("")
          || `<tr><td colspan="5">Подключите ADMIN_KEY для stats</td></tr>`}
        </tbody></table>
      </div>
      <div class="actions"><a class="btn secondary" href="https://charter-chat.wegc.workers.dev/admin" target="_blank">Admin CRM ↗</a></div>
    </div>`;
}

async function renderTraffic() {
  const d = await api("/api/traffic");
  $("#panel").innerHTML = `
    <div class="card section">
      <h3>Яндекс.Директ</h3>
      <div class="meta">${d.note || "Заглушка — подключите API или вводите вручную"}</div>
      <form id="traffic-form" style="margin-top:14px">
        <div class="grid grid-2">
          <label>Расход ₽/нед <input name="spend_week" type="number" value="${d.spend_week||""}"></label>
          <label>Клики <input name="clicks" type="number" value="${d.clicks||""}"></label>
          <label>CTR % <input name="ctr" type="number" step="0.1" value="${d.ctr||""}"></label>
          <label>Заявки <input name="leads" type="number" value="${d.leads||""}"></label>
        </div>
        <div class="actions"><button class="btn secondary" type="submit">Сохранить</button>
          <button class="btn secondary" type="button" data-act="regenerate-direct">Regenerate CSV</button></div>
      </form>
    </div>`;
  $("#traffic-form").onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    await api("/api/traffic", { method: "POST", body: JSON.stringify(body) });
    toast("Сохранено");
  };
  bindActions();
}

async function renderContent() {
  const [kanban, drafts] = await Promise.all([
    api("/api/content/kanban"),
    api("/api/drafts"),
  ]);
  $("#panel").innerHTML = `
    <div class="kanban section">
      <div class="col"><h4>● Опубликовано (${(kanban.published||[]).length})</h4>
        ${(kanban.published||[]).map(a => `<div class="item"><b>${a.num}</b> ${a.title}<br><span class="meta">${a.url||""}</span></div>`).join("")}</div>
      <div class="col"><h4>○ В плане P1–P2 (${(kanban.planned||[]).length})</h4>
        ${(kanban.planned||[]).map(a => `<div class="item"><b>${a.priority}</b> ${a.title}<br><span class="meta">${a.slug}</span></div>`).join("")}</div>
    </div>
    <div class="section-title">Черновики (не опубликованы)</div>
    <div class="grid grid-2">
      <div class="card"><h3>TG @ccapital26</h3>${(drafts.tg||[]).map(f => `<div class="meta">· ${f.name}</div>`).join("") || "<div class='meta'>—</div>"}</div>
      <div class="card"><h3>VC.ru</h3>${(drafts.vc||[]).map(f => `<div class="meta">· ${f.name}</div>`).join("") || "<div class='meta'>—</div>"}</div>
      <div class="card"><h3>Reels</h3>${(drafts.reels||[]).map(f => `<div class="meta">· ${f.name}</div>`).join("") || "<div class='meta'>—</div>"}</div>
    </div>`;
}

async function renderDzen() {
  const d = await api("/api/dzen");
  $("#panel").innerHTML = `
    <div class="card section card-gold">
      <h3>Канал @charter_capital</h3>
      <div class="meta">Цель: ${d.subscribers_goal} подписчиков для RSS-импорта</div>
      <div class="meta">${d.note}</div>
    </div>
    <div class="card section">
      <h3>feed.xml</h3>
      <div class="val">${d.feed?.items ?? "—"}</div>
      <div class="meta">items · content:encoded: ${d.feed?.has_content_encoded ? "да" : "нет"}</div>
      <div class="actions">
        <button class="btn secondary" data-act="rebuild-dzen">Rebuild feed</button>
        <a class="btn secondary" href="https://ccapital.pro/journal/feed.xml" target="_blank">Открыть feed ↗</a>
      </div>
    </div>`;
  bindActions();
}

async function renderLogs() {
  const d = await api("/api/logs");
  $("#panel").innerHTML = `
    <div class="section">
      <div class="section-title">Лента событий</div>
      ${(d.logs||[]).map(l => `<div class="log-line"><b>${fmtTime(l.ts)}</b> [${l.type}] ${l.message}</div>`).join("")
        || "<div class='meta'>Логи появятся после действий (IndexNow, Deploy…)</div>"}
    </div>`;
}

async function bindActions() {
  $$("[data-act]").forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const act = btn.dataset.act;
        if (act === "deploy") {
          await api("/api/actions/deploy", { method: "POST" });
          toast("Deploy workflow запущен");
        } else if (act === "indexnow-default") {
          const r = await api("/api/actions/indexnow", { method: "POST", body: JSON.stringify({ mode: "default" }) });
          toast(`IndexNow: HTTP ${r.status}, ${r.url_count} URL`);
        } else if (act === "indexnow-recent") {
          const r = await api("/api/actions/indexnow", { method: "POST", body: JSON.stringify({ mode: "recent" }) });
          toast(`IndexNow recent: HTTP ${r.status}`);
        } else if (act === "rebuild-dzen") {
          await api("/api/actions/rebuild-dzen-feed", { method: "POST" });
          toast("Rebuild feed workflow запущен");
        } else if (act === "regenerate-direct") {
          await api("/api/actions/regenerate-direct", { method: "POST" });
          toast("Regenerate CSV workflow запущен");
        }
        await refresh();
      } catch (e) { toast(e.message); }
      finally { btn.disabled = false; }
    };
  });
}

async function showPanel(name) {
  panel = name;
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.panel === name));
  $("#panel").innerHTML = "<div class='meta'>Загрузка…</div>";
  if (!overview) await loadOverview();
  if (name === "overview") renderOverview();
  else if (name === "publish") renderPublish();
  else if (name === "leads") await renderLeads();
  else if (name === "traffic") await renderTraffic();
  else if (name === "content") await renderContent();
  else if (name === "dzen") await renderDzen();
  else if (name === "logs") await renderLogs();
}

async function refresh() {
  overview = null;
  await showPanel(panel);
}

$("#enter-btn").onclick = async () => {
  SECRET = $("#secret").value.trim();
  localStorage.setItem("cc_tower_secret", SECRET);
  try {
    await loadOverview();
    $("#gate").hidden = true;
    $("#app").hidden = false;
    await showPanel("overview");
  } catch (e) { toast(e.message); }
};

$("#secret").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#enter-btn").click();
});

$$("#tabs .tab").forEach(t => t.onclick = () => showPanel(t.dataset.panel));
$("#refresh").onclick = refresh;

if (SECRET) {
  loadOverview().then(() => {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    showPanel("overview");
  }).catch(() => {});
}
