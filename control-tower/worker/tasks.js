import { TASKS_SEED } from "./tasks-seed.js";

const KV_KEY = "tasks:state";

export function defaultState() {
  return {
    owners: TASKS_SEED.owners,
    noticeTypes: TASKS_SEED.noticeTypes,
    tasks: structuredClone(TASKS_SEED.tasks),
    done: {},
    meta: { updatedAt: null, updatedBy: null },
  };
}

export async function loadTasks(env) {
  if (!env.TOWER_KV) return defaultState();
  const raw = await env.TOWER_KV.get(KV_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      owners: parsed.owners || TASKS_SEED.owners,
      noticeTypes: parsed.noticeTypes || TASKS_SEED.noticeTypes,
      tasks: parsed.tasks || TASKS_SEED.tasks,
      done: parsed.done || {},
    };
  } catch {
    return defaultState();
  }
}

export async function saveTasks(env, body, updatedBy = null) {
  const current = await loadTasks(env);
  const next = {
    owners: body.owners || current.owners,
    noticeTypes: body.noticeTypes || current.noticeTypes,
    tasks: body.tasks ?? current.tasks,
    done: body.done ?? current.done,
    meta: {
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || body.updatedBy || null,
    },
  };
  if (env.TOWER_KV) {
    await env.TOWER_KV.put(KV_KEY, JSON.stringify(next));
  }
  return next;
}

export async function patchDone(env, subId, done, updatedBy = null) {
  const current = await loadTasks(env);
  const doneMap = { ...current.done };
  if (done) doneMap[subId] = true;
  else delete doneMap[subId];
  return saveTasks(env, { ...current, done: doneMap, updatedBy }, updatedBy);
}

export function tasksCors(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    "https://ccapital.pro",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ]);
  if (!allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function handleTasksApi(request, env, path, method, checkAuth) {
  const cors = tasksCors(request);
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (path === "/api/tasks" && method === "GET") {
    if (!checkAuth(request, env)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    const state = await loadTasks(env);
    return new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json", ...cors },
    });
  }

  if (!checkAuth(request, env)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...cors },
    });
  }

  if (path === "/api/tasks" && method === "PUT") {
    const body = await request.json();
    const state = await saveTasks(env, body, body.updatedBy || null);
    return new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json", ...cors },
    });
  }

  if (path === "/api/tasks/done" && method === "PATCH") {
    const body = await request.json();
    if (!body.subId || typeof body.done !== "boolean") {
      return new Response(JSON.stringify({ error: "subId and done required" }), {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    const state = await patchDone(env, body.subId, body.done, body.updatedBy || null);
    return new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json", ...cors },
    });
  }

  return null;
}
