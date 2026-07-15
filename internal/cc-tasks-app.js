/* global CC_TASKS */
const API = "https://ccapital-control-tower.wegc.workers.dev";
const SECRET_KEY = "cc_tower_secret";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let SECRET = localStorage.getItem(SECRET_KEY) || "";
let state = null;
let activeOwner = "all";
let searchQuery = "";
let editMode = false;
let editing = null;
let syncTimer = null;
let saving = false;

function toast(msg, ms = 3200) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, ms);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    $("#gate").hidden = false;
    $("#app").hidden = true;
    throw new Error("Неверный пароль");
  }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + "T23:59:59");
  return isNaN(d) ? null : d;
}

function deadlineClass(d) {
  if (!d) return "";
  const diff = (d - new Date()) / 86400000;
  if (diff < 0) return "overdue";
  if (diff <= 3) return "soon";
  return "";
}

function fmtDate(s) {
  if (!s) return "—";
  const p = s.split("-");
  return `${p[2]}.${p[1]}`;
}

function fmtSync(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

function subProgress(task) {
  const total = task.subs.length;
  const done = task.subs.filter(s => state.done[s.id]).length;
  return { done, total };
}

function taskDeadline(task) {
  const dates = [task.deadline, ...task.subs.map(s => s.deadline)].filter(Boolean).map(parseDate);
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a < b ? a : b));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function loadState(silent = false) {
  if (!SECRET) return;
  try {
    const remote = await api("/api/tasks");
    if (!state || !editMode) {
      const prevMeta = state?.meta?.updatedAt;
      state = remote;
      if (!silent && prevMeta && prevMeta !== remote.meta?.updatedAt) {
        toast("Обновлено с сервера");
      }
      renderAll();
    }
    $("#sync-status").textContent = `Синхр. ${fmtSync(remote.meta?.updatedAt)}`;
  } catch (e) {
    if (!silent) toast(e.message);
    if (!state && window.CC_TASKS) {
      state = {
        ...window.CC_TASKS,
        done: {},
        meta: { updatedAt: null },
      };
      renderAll();
      toast("Оффлайн: локальные данные");
    }
  }
}

async function saveState() {
  if (saving || !state) return;
  saving = true;
  $("#save-btn").disabled = true;
  try {
    state = await api("/api/tasks", {
      method: "PUT",
      body: JSON.stringify(state),
    });
    toast("Сохранено");
    renderAll();
  } catch (e) {
    toast("Ошибка: " + e.message);
  } finally {
    saving = false;
    $("#save-btn").disabled = false;
  }
}

async function toggleDone(subId, done) {
  if (!state) return;
  if (done) state.done[subId] = true;
  else delete state.done[subId];
  renderStats();
  renderTasks();
  try {
    state = await api("/api/tasks/done", {
      method: "PATCH",
      body: JSON.stringify({ subId, done }),
    });
    $("#sync-status").textContent = `Синхр. ${fmtSync(state.meta?.updatedAt)}`;
  } catch (e) {
    toast("Не синхронизировано: " + e.message);
  }
}

function renderStats() {
  if (!state) return;
  const allSubs = state.tasks.flatMap(t => t.subs);
  const total = allSubs.length;
  const done = allSubs.filter(s => state.done[s.id]).length;
  const now = new Date();
  const overdue = allSubs.filter(s => {
    if (state.done[s.id]) return false;
    const d = parseDate(s.deadline);
    return d && d < now;
  }).length;
  $("#stats").innerHTML = `
    <div class="stat"><b>${state.tasks.length}</b><span>Блоков</span></div>
    <div class="stat"><b>${total - done}</b><span>Открыто</span></div>
    <div class="stat"><b>${done}</b><span>Готово</span></div>
    <div class="stat overdue"><b>${overdue}</b><span>Просрочено</span></div>`;
}

function renderFilters() {
  const el = $("#owner-filters");
  const btns = [{ id: "all", label: "Все" }, ...state.owners.map(o => ({ id: o, label: o }))];
  el.innerHTML = btns.map(b =>
    `<button class="filter-btn${activeOwner === b.id ? " active" : ""}" data-owner="${b.id}">${esc(b.label)}</button>`
  ).join("");
  el.querySelectorAll(".filter-btn").forEach(btn => {
    btn.onclick = () => {
      activeOwner = btn.dataset.owner;
      renderFilters();
      renderTasks();
    };
  });
}

function matchesFilter(task) {
  if (activeOwner !== "all") {
    const inTask = task.owners.includes(activeOwner);
    const inSubs = task.subs.some(s => s.owners.includes(activeOwner));
    if (!inTask && !inSubs) return false;
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const hay = [
      task.title, task.category, task.summary,
      ...task.subs.flatMap(s => [s.title, s.what, s.contact, s.notice, ...(s.owners || [])]),
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderTasks() {
  if (!state) return;
  const list = $("#task-list");
  const filtered = state.tasks.filter(matchesFilter);
  $("#empty").hidden = filtered.length > 0;

  list.innerHTML = filtered.map(task => {
    const prog = subProgress(task);
    const allDone = prog.done === prog.total;
    const dl = taskDeadline(task);
    const dlStr = task.deadline ? fmtDate(task.deadline) : (dl ? fmtDate(dl.toISOString().slice(0, 10)) : "—");
    const dlCls = deadlineClass(dl);

    const subsHtml = task.subs.map(sub => {
      const checked = state.done[sub.id] ? "checked" : "";
      const subDone = state.done[sub.id] ? "done" : "";
      const subDlCls = deadlineClass(parseDate(sub.deadline));
      const ownersHtml = (sub.owners || []).map(o => `<span class="owner">${esc(o)}</span>`).join("");
      const linksHtml = (sub.links || []).map(l =>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
      ).join("");
      const editBtns = editMode ? `
        <button class="btn-icon" data-edit-sub="${esc(sub.id)}" data-task-id="${esc(task.id)}" title="Редактировать">✎</button>
        <button class="btn-icon danger" data-del-sub="${esc(sub.id)}" data-task-id="${esc(task.id)}" title="Удалить">×</button>` : "";

      return `
        <div class="sub ${subDone}" data-sub-id="${esc(sub.id)}">
          <input type="checkbox" class="sub-check" ${checked} aria-label="Готово"${editMode ? " disabled" : ""}>
          <div>
            <div class="sub-head">
              <div class="sub-title">${esc(sub.title)}</div>
              <div class="sub-actions">${editBtns}</div>
            </div>
            <div class="sub-what">${esc(sub.what)}</div>
            <div class="sub-row">
              ${ownersHtml}
              <span class="notice">${esc(sub.notice)}</span>
              ${sub.contact && sub.contact !== "—" ? `<span class="contact">${esc(sub.contact)}</span>` : ""}
              ${sub.deadline ? `<span class="badge deadline ${subDlCls}">${fmtDate(sub.deadline)}</span>` : ""}
            </div>
            ${linksHtml ? `<div class="sub-links">${linksHtml}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    const taskEdit = editMode ? `
      <div class="task-edit-bar">
        <button class="btn sm" data-edit-task="${esc(task.id)}">✎ Блок</button>
        <button class="btn sm" data-add-sub="${esc(task.id)}">+ Подзадача</button>
        <button class="btn sm danger" data-del-task="${esc(task.id)}">Удалить блок</button>
      </div>` : "";

    return `
      <article class="task-card${allDone ? " done" : ""}" data-task-id="${esc(task.id)}">
        <div class="task-head" role="button" tabindex="0" aria-expanded="false">
          <div class="expand">▶</div>
          <div>
            <div class="task-title">${esc(task.title)}</div>
            <div class="task-sub">${esc(task.summary || "")}</div>
          </div>
          <div class="task-meta">
            <span class="badge cat">${esc(task.category)}</span>
            <span class="badge deadline ${dlCls}">${dlStr}</span>
            <span class="badge progress">${prog.done}/${prog.total}</span>
            ${task.owners.map(o => `<span class="owner">${esc(o)}</span>`).join("")}
          </div>
        </div>
        <div class="task-body">
          ${task.link ? `<a class="task-link" href="${esc(task.link)}" target="_blank" rel="noopener">↗ Основная ссылка блока</a>` : ""}
          ${taskEdit}
          <div class="subs">${subsHtml}</div>
        </div>
      </article>`;
  }).join("");

  list.querySelectorAll(".task-head").forEach(head => {
    const toggle = () => {
      if (editMode && event?.target?.closest(".btn-icon, .btn")) return;
      const card = head.closest(".task-card");
      const open = card.classList.toggle("open");
      head.setAttribute("aria-expanded", open);
    };
    head.addEventListener("click", e => {
      if (e.target.closest(".sub-check, .btn, .btn-icon")) return;
      toggle();
    });
    head.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });

  if (!editMode) {
    list.querySelectorAll(".sub-check").forEach(cb => {
      cb.addEventListener("click", e => e.stopPropagation());
      cb.onchange = () => {
        const id = cb.closest(".sub").dataset.subId;
        toggleDone(id, cb.checked);
      };
    });
  }

  if (editMode) bindEditActions(list);
}

function bindEditActions(list) {
  list.querySelectorAll("[data-edit-task]").forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); openEditor("task", btn.dataset.editTask); };
  });
  list.querySelectorAll("[data-edit-sub]").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      openEditor("sub", btn.dataset.taskId, btn.dataset.editSub);
    };
  });
  list.querySelectorAll("[data-add-sub]").forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); openEditor("sub-new", btn.dataset.addSub); };
  });
  list.querySelectorAll("[data-del-task]").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (!confirm("Удалить блок и все подзадачи?")) return;
      state.tasks = state.tasks.filter(t => t.id !== btn.dataset.delTask);
      saveState();
    };
  });
  list.querySelectorAll("[data-del-sub]").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (!confirm("Удалить подзадачу?")) return;
      const task = state.tasks.find(t => t.id === btn.dataset.taskId);
      if (task) task.subs = task.subs.filter(s => s.id !== btn.dataset.delSub);
      delete state.done[btn.dataset.delSub];
      saveState();
    };
  });
}

function ownersSelect(selected, multi = true) {
  return state.owners.map(o => {
    const sel = selected.includes(o) ? " selected" : "";
    return `<option value="${esc(o)}"${sel}>${esc(o)}</option>`;
  }).join("");
}

function noticeSelect(current) {
  return state.noticeTypes.map(n =>
    `<option value="${esc(n)}"${n === current ? " selected" : ""}>${esc(n)}</option>`
  ).join("");
}

function linksToText(links) {
  return (links || []).map(l => `${l.label} | ${l.url}`).join("\n");
}

function textToLinks(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const [label, ...rest] = line.split("|");
    const url = rest.join("|").trim();
    return { label: label.trim(), url };
  }).filter(l => l.label && l.url);
}

function openEditor(type, taskId, subId = null) {
  editing = { type, taskId, subId };
  const modal = $("#modal");
  const form = $("#edit-form");
  const task = state.tasks.find(t => t.id === taskId);
  let sub = subId ? task?.subs.find(s => s.id === subId) : null;

  if (type === "sub-new") {
    const newId = uid("sub");
    editing.subId = newId;
    sub = {
      id: newId,
      title: "",
      what: "",
      contact: "",
      notice: "Follow-up",
      owners: [...(task?.owners || [])],
      deadline: "",
      links: [],
    };
  }

  const isTask = type === "task" || type === "task-new";

  $("#modal-title").textContent =
    type === "task-new" ? "Новый блок" :
    type === "sub-new" ? "Новая подзадача" :
    isTask ? "Редактировать блок" : "Редактировать подзадачу";

  form.innerHTML = isTask ? `
    <label>Название<input name="title" value="${esc(task?.title || "")}" required></label>
    <label>Категория<input name="category" value="${esc(task?.category || "")}"></label>
    <label>Кратко<textarea name="summary">${esc(task?.summary || "")}</textarea></label>
    <label>Дедлайн блока<input name="deadline" type="date" value="${esc(task?.deadline || "")}"></label>
    <label>Ответственные<select name="owners" multiple size="4">${ownersSelect(task?.owners || [])}</select></label>
    <label>Ссылка блока<input name="link" value="${esc(task?.link || "")}" placeholder="https://"></label>
  ` : `
    <label>Название<input name="title" value="${esc(sub.title)}" required></label>
    <label>Что сделать<textarea name="what">${esc(sub.what)}</textarea></label>
    <label>Контакт<input name="contact" value="${esc(sub.contact || "")}"></label>
    <label>Форма контакта<select name="notice">${noticeSelect(sub.notice)}</select></label>
    <label>Ответственные<select name="owners" multiple size="4">${ownersSelect(sub.owners || [])}</select></label>
    <label>Дедлайн<input name="deadline" type="date" value="${esc(sub.deadline || "")}"></label>
    <label>Ссылки (каждая строка: «Название | URL»)<textarea name="links" rows="3">${esc(linksToText(sub.links))}</textarea></label>
  `;

  modal.hidden = false;
}

function closeEditor() {
  if (editing?.type === "task-new") {
    const t = state.tasks.find(x => x.id === editing.taskId);
    if (t && !t.title?.trim()) {
      state.tasks = state.tasks.filter(x => x.id !== editing.taskId);
      renderTasks();
    }
  }
  $("#modal").hidden = true;
  editing = null;
}

function readMultiSelect(sel) {
  return [...sel.selectedOptions].map(o => o.value);
}

function applyEditor(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const { type, taskId, subId } = editing;

  if (type === "task" || type === "task-new") {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.title = fd.get("title").trim();
    task.category = fd.get("category").trim();
    task.summary = fd.get("summary").trim();
    task.deadline = fd.get("deadline") || "";
    task.link = fd.get("link").trim();
    task.owners = readMultiSelect(e.target.querySelector('[name="owners"]'));
    if (!task.title) {
      state.tasks = state.tasks.filter(t => t.id !== taskId);
    }
  } else {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    let sub;
    if (type === "sub-new") {
      sub = { id: subId };
    } else {
      sub = task.subs.find(s => s.id === subId);
    }
    if (!sub) return;
    sub.title = fd.get("title").trim();
    sub.what = fd.get("what").trim();
    sub.contact = fd.get("contact").trim() || "—";
    sub.notice = fd.get("notice");
    sub.deadline = fd.get("deadline") || "";
    sub.owners = readMultiSelect(e.target.querySelector('[name="owners"]'));
    sub.links = textToLinks(fd.get("links"));
    if (type === "sub-new") task.subs.push(sub);
  }

  closeEditor();
  saveState();
}

function renderAll() {
  renderStats();
  renderFilters();
  renderTasks();
  $("#edit-toggle").classList.toggle("active", editMode);
  $("#edit-toolbar").hidden = !editMode;
}

function startSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(() => loadState(true), 20000);
}

function bootApp() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  loadState().then(startSync);
}

$("#enter-btn").onclick = async () => {
  SECRET = $("#secret").value.trim();
  localStorage.setItem(SECRET_KEY, SECRET);
  try {
    await api("/api/tasks");
    bootApp();
  } catch (e) { toast(e.message); }
};

$("#secret").addEventListener("keydown", e => {
  if (e.key === "Enter") $("#enter-btn").click();
});

$("#logout-btn").onclick = () => {
  SECRET = "";
  localStorage.removeItem(SECRET_KEY);
  clearInterval(syncTimer);
  $("#gate").hidden = false;
  $("#app").hidden = true;
};

$("#refresh-btn").onclick = () => loadState();

$("#edit-toggle").onclick = () => {
  editMode = !editMode;
  renderAll();
};

$("#add-task-btn").onclick = () => {
  const id = uid("task");
  state.tasks.push({
    id,
    title: "",
    category: "",
    summary: "",
    deadline: "",
    owners: [],
    link: "",
    subs: [],
  });
  openEditor("task-new", id);
};

$("#save-btn").onclick = saveState;
$("#modal-close").onclick = closeEditor;
$("#edit-form").onsubmit = applyEditor;
$("#modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeEditor();
});

$("#search").oninput = e => {
  searchQuery = e.target.value.trim();
  renderTasks();
};

if (SECRET) {
  api("/api/tasks").then(() => bootApp()).catch(() => {});
}
