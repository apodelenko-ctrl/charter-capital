/* lead-form.js — обработчик заявок Charter Capital.
 * Перехватывает отправку любой формы с классом .cform и:
 *   1) шлёт цель в Яндекс.Метрику (residence_form) — конверсия видна в Директе;
 *   2) отправляет лид на воркер (Telegram владельцу + запись в D1);
 *   3) дублирует заявку в Formspree (email-бэкап) — AJAX, без ухода со страницы;
 *   4) уводит на аккуратную страницу /thanks.html.
 * Нативная отправка не ломается: если JS не загрузился, форма уйдёт в Formspree как раньше.
 */
(function () {
  "use strict";

  var METRIKA_ID = 108969822;
  var THANKS_URL = "/thanks.html";
  var LEAD_API =
    (window.CHARTER_CHAT_API && String(window.CHARTER_CHAT_API).replace(/\/web\/?$/, "/lead")) ||
    "https://charter-chat.wegc.workers.dev/lead";

  function reachGoal() {
    try {
      if (typeof window.ym === "function") window.ym(METRIKA_ID, "reachGoal", "residence_form");
    } catch (e) {}
  }

  function fieldVal(fd, key) {
    var v = fd.get(key);
    return v == null ? "" : String(v);
  }

  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || !form.classList || !form.classList.contains("cform")) return;

      e.preventDefault();

      // novalidate на формах → проверяем обязательные поля вручную
      if (typeof form.checkValidity === "function" && !form.checkValidity()) {
        if (typeof form.reportValidity === "function") form.reportValidity();
        return;
      }

      var fd = new FormData(form);

      // honeypot Formspree: если заполнено — это бот, тихо «успех» без отправки
      if (fieldVal(fd, "_gotcha")) {
        window.location.href = THANKS_URL;
        return;
      }

      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.dataset.label = btn.textContent;
        btn.textContent = "Отправляем…";
      }

      reachGoal();

      var payload = {
        name: fieldVal(fd, "name"),
        email: fieldVal(fd, "email"),
        contact: fieldVal(fd, "tg") || fieldVal(fd, "phone"),
        country: fieldVal(fd, "country"),
        goal: fieldVal(fd, "goal"),
        message: fieldVal(fd, "message"),
        page: window.location.pathname,
        subject: fieldVal(fd, "_subject"),
      };

      // 1) наш воркер → Telegram владельцу + D1 (не блокируем UX, если упадёт)
      var toWorker = fetch(LEAD_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(function () {});

      // 2) Formspree как email-бэкап (Accept: json → без редиректа)
      var toFormspree = form.action
        ? fetch(form.action, { method: "POST", body: fd, headers: { Accept: "application/json" } }).catch(
            function () {}
          )
        : Promise.resolve();

      var settle = Promise.allSettled ? Promise.allSettled([toWorker, toFormspree]) : Promise.all([toWorker, toFormspree]);
      settle.then(function () {
        window.location.href = THANKS_URL;
      });

      // страховка: даже при зависшей сети уводим на «спасибо» через 4 c
      setTimeout(function () {
        window.location.href = THANKS_URL;
      }, 4000);
    },
    true
  );
})();
