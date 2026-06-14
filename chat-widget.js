/*!
 * Charter Capital — живой AI-чат (виджет).
 * Самодостаточный: инжектит свой CSS + DOM. Подключать на все страницы:
 *   <script src="/chat-widget.js?v=20260613" defer></script>
 * При каждом изменении файла поднимай ?v=ГГГГММДД, иначе правка не доедет из-за кэша.
 *
 * Конфиг (необязательно) перед подключением скрипта:
 *   <script>window.CHARTER_CHAT_API = "https://chat.ccapital.pro/web";</script>
 */
(function () {
  "use strict";
  if (window.__charterChatLoaded) return;
  window.__charterChatLoaded = true;

  // ── конфиг ────────────────────────────────────────────────
  var API_URL =
    window.CHARTER_CHAT_API ||
    (document.currentScript && document.currentScript.getAttribute("data-api")) ||
    "https://charter-chat.wegc.workers.dev/web";

  var ASSISTANT = "Артур";
  var REQUEST_TIMEOUT = 30000;

  var LANG = (document.documentElement.getAttribute("lang") || "ru")
    .toLowerCase()
    .split("-")[0];

  var I18N = {
    ru: {
      title: "Charter Capital",
      subtitle: "Консьерж " + ASSISTANT + " · на связи",
      greeting:
        "Здравствуйте! Я " +
        ASSISTANT +
        ", консьерж Charter Capital. Помогу с зарубежным счётом, Source of Funds, ВНЖ и легальным маршрутом капитала. С какой задачей пришли?",
      placeholder: "Напишите сообщение…",
      send: "Отправить",
      open: "Задать вопрос",
      error:
        "Не получилось отправить. Попробуйте ещё раз или напишите в Telegram: https://t.me/ccapital_acces",
    },
    en: {
      title: "Charter Capital",
      subtitle: "Concierge " + ASSISTANT + " · online",
      greeting:
        "Hello! I'm " +
        ASSISTANT +
        ", Charter Capital's concierge. I help with foreign bank accounts, Source of Funds, residency and a legal capital route. How can I help?",
      placeholder: "Type a message…",
      send: "Send",
      open: "Ask a question",
      error:
        "Couldn't send. Please try again or reach us on Telegram: https://t.me/ccapital_acces",
    },
  };
  var T = I18N[LANG] || I18N.ru;

  // ── сессия ────────────────────────────────────────────────
  function uid() {
    try {
      return (
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10)
      );
    } catch (e) {
      return "s" + Date.now();
    }
  }
  var SID_KEY = "cc_chat_sid";
  var sid;
  try {
    sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = uid();
      localStorage.setItem(SID_KEY, sid);
    }
  } catch (e) {
    sid = uid();
  }

  // ── утилиты ───────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  // линкуем URL уже после экранирования HTML
  function linkify(text) {
    var safe = escapeHtml(text);
    return safe.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)）】」"'])/g, function (url) {
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener noreferrer">' +
        url +
        "</a>"
      );
    });
  }

  // ── стили ─────────────────────────────────────────────────
  var CSS =
    "" +
    ".ccw-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:9px;" +
    "background:#0e1a33;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:13px 18px;" +
    "font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;cursor:pointer;" +
    "box-shadow:0 10px 34px rgba(4,8,20,.34);transition:transform .18s ease,box-shadow .18s ease}" +
    ".ccw-btn:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(4,8,20,.42)}" +
    ".ccw-btn svg{width:20px;height:20px;flex:0 0 auto}" +
    ".ccw-btn .ccw-dot{width:8px;height:8px;border-radius:50%;background:#3ad17a;box-shadow:0 0 0 3px rgba(58,209,122,.22)}" +
    ".ccw-hidden{display:none!important}" +
    ".ccw-panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);" +
    "height:600px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#0b1426;color:#eaf0fb;" +
    "border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(2,6,16,.55);" +
    "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}" +
    ".ccw-head{display:flex;align-items:center;gap:11px;padding:15px 16px;background:#0e1a33;border-bottom:1px solid rgba(255,255,255,.08)}" +
    ".ccw-ava{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2b5d91,#16284a);display:flex;" +
    "align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;flex:0 0 auto}" +
    ".ccw-h-title{font-weight:600;font-size:15px}" +
    ".ccw-h-sub{font-size:12px;color:#8ea6cf;margin-top:2px;display:flex;align-items:center;gap:6px}" +
    ".ccw-h-sub .ccw-dot{width:7px;height:7px;border-radius:50%;background:#3ad17a}" +
    ".ccw-close{margin-left:auto;background:transparent;border:0;color:#9fb3d6;cursor:pointer;font-size:22px;line-height:1;padding:4px 6px;border-radius:8px}" +
    ".ccw-close:hover{background:rgba(255,255,255,.08);color:#fff}" +
    ".ccw-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#0b1426}" +
    ".ccw-row{display:flex;max-width:100%}" +
    ".ccw-row.user{justify-content:flex-end}" +
    ".ccw-bubble{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".ccw-row.bot .ccw-bubble{background:#16233f;color:#eaf0fb;border-bottom-left-radius:5px}" +
    ".ccw-row.user .ccw-bubble{background:#2b5d91;color:#fff;border-bottom-right-radius:5px}" +
    ".ccw-bubble a{color:#9cc4ff;text-decoration:underline;word-break:break-all}" +
    ".ccw-row.user .ccw-bubble a{color:#dbe8ff}" +
    ".ccw-typing{display:flex;gap:4px;padding:12px 14px;background:#16233f;border-radius:14px;border-bottom-left-radius:5px;width:fit-content}" +
    ".ccw-typing span{width:7px;height:7px;border-radius:50%;background:#7d97c4;animation:ccw-blink 1.3s infinite both}" +
    ".ccw-typing span:nth-child(2){animation-delay:.2s}.ccw-typing span:nth-child(3){animation-delay:.4s}" +
    "@keyframes ccw-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
    ".ccw-foot{padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);background:#0e1a33}" +
    ".ccw-inwrap{display:flex;align-items:flex-end;gap:8px;background:#0b1426;border:1px solid rgba(255,255,255,.12);border-radius:13px;padding:7px 8px 7px 12px}" +
    ".ccw-ta{flex:1;background:transparent;border:0;outline:0;color:#eaf0fb;font:14px/1.45 inherit;resize:none;max-height:120px;min-height:22px}" +
    ".ccw-ta::placeholder{color:#7d93b8}" +
    ".ccw-send{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:0;background:#2b5d91;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".ccw-send:hover{background:#3470ad}.ccw-send:disabled{opacity:.45;cursor:default}" +
    ".ccw-send svg{width:18px;height:18px}" +
    ".ccw-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}" +
    "@media (max-width:520px){" +
    ".ccw-panel{right:0;left:0;bottom:0;top:0;width:100%;max-width:100%;height:auto;max-height:none;border-radius:0;" +
    "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}" +
    ".ccw-btn{right:16px;bottom:16px}}";

  function injectCSS() {
    var st = document.createElement("style");
    st.id = "ccw-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── DOM ───────────────────────────────────────────────────
  var panel, body, ta, sendBtn, btn, typingEl, opened = false, greeted = false;

  function chatIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>';
  }
  function sendIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
  }

  function buildButton() {
    btn = document.createElement("button");
    btn.className = "ccw-btn";
    btn.setAttribute("aria-label", T.open);
    btn.innerHTML = '<span class="ccw-dot"></span>' + chatIcon() + "<span>" + escapeHtml(T.open) + "</span>";
    btn.addEventListener("click", openPanel);
    document.body.appendChild(btn);
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "ccw-panel ccw-hidden";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", T.title);
    panel.innerHTML =
      '<div class="ccw-head">' +
      '<div class="ccw-ava">' + escapeHtml(ASSISTANT.charAt(0)) + "</div>" +
      "<div><div class=\"ccw-h-title\">" + escapeHtml(T.title) + "</div>" +
      '<div class="ccw-h-sub"><span class="ccw-dot"></span>' + escapeHtml(T.subtitle) + "</div></div>" +
      '<button class="ccw-close" aria-label="Close">×</button>' +
      "</div>" +
      '<div class="ccw-body"></div>' +
      '<div class="ccw-foot">' +
      '<div class="ccw-inwrap">' +
      '<input class="ccw-hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<textarea class="ccw-ta" rows="1" placeholder="' + escapeHtml(T.placeholder) + '"></textarea>' +
      '<button class="ccw-send" aria-label="' + escapeHtml(T.send) + '">' + sendIcon() + "</button>" +
      "</div></div>";
    document.body.appendChild(panel);

    body = panel.querySelector(".ccw-body");
    ta = panel.querySelector(".ccw-ta");
    sendBtn = panel.querySelector(".ccw-send");

    panel.querySelector(".ccw-close").addEventListener("click", closePanel);
    sendBtn.addEventListener("click", onSend);
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
    ta.addEventListener("input", autoGrow);
  }

  function autoGrow() {
    ta.style.height = "auto";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  }

  // ── рендер сообщений ──────────────────────────────────────
  function addBubble(text, who) {
    var row = document.createElement("div");
    row.className = "ccw-row " + (who === "user" ? "user" : "bot");
    var b = document.createElement("div");
    b.className = "ccw-bubble";
    b.innerHTML = linkify(text);
    row.appendChild(b);
    body.appendChild(row);
    scrollDown();
  }

  function showTyping() {
    hideTyping();
    typingEl = document.createElement("div");
    typingEl.className = "ccw-row bot";
    typingEl.innerHTML = '<div class="ccw-typing"><span></span><span></span><span></span></div>';
    body.appendChild(typingEl);
    scrollDown();
  }
  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }
  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }

  // ── открытие/закрытие ─────────────────────────────────────
  function openPanel() {
    opened = true;
    panel.classList.remove("ccw-hidden");
    btn.classList.add("ccw-hidden");
    if (!greeted) {
      greeted = true;
      addBubble(T.greeting, "bot");
    }
    setTimeout(function () {
      ta.focus();
    }, 50);
  }
  function closePanel() {
    opened = false;
    panel.classList.add("ccw-hidden");
    btn.classList.remove("ccw-hidden");
  }

  // ── отправка ──────────────────────────────────────────────
  var busy = false;
  function onSend() {
    if (busy) return;
    var text = (ta.value || "").trim();
    if (!text) return;
    var hp = panel.querySelector(".ccw-hp");
    if (hp && hp.value) return; // honeypot — это бот

    addBubble(text, "user");
    ta.value = "";
    autoGrow();
    sendMessage(text);
  }

  function sendMessage(text) {
    busy = true;
    sendBtn.disabled = true;
    showTyping();

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT);

    fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sid: sid, text: text, lang: LANG, company: "" }),
      signal: controller.signal,
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        hideTyping();
        addBubble((data && data.reply) || T.error, "bot");
      })
      .catch(function () {
        clearTimeout(timer);
        hideTyping();
        addBubble(T.error, "bot");
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        if (opened) ta.focus();
      });
  }

  // ── init ──────────────────────────────────────────────────
  function init() {
    injectCSS();
    buildButton();
    buildPanel();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
