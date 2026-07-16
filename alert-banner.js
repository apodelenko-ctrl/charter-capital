/*!
 * Charter Capital — красный баннер срочной эвакуации капитала.
 * Самодостаточный: инжектит CSS + DOM, сдвигает fixed-топбар вниз.
 * Подключать на все страницы: <script src="/alert-banner.js?v=20260716" defer></script>
 * При изменении файла поднимать ?v=ГГГГММДД (кэш).
 *
 * Логика:
 *  - только RU-страницы (lang="ru"), не показывается на самой /evacuation.html
 *  - крестик скрывает до конца сессии (sessionStorage)
 */
(function () {
  "use strict";
  if (window.__ccAlertBannerLoaded) return;
  window.__ccAlertBannerLoaded = true;

  var lang = (document.documentElement.getAttribute("lang") || "ru").toLowerCase();
  if (lang.indexOf("ru") !== 0) return;
  if (location.pathname.indexOf("evacuation") !== -1) return;
  try {
    if (sessionStorage.getItem("cc_evac_banner_hidden") === "1") return;
  } catch (e) { /* приватный режим — показываем */ }

  var css = [
    "#cc-evac-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;",
    "background:linear-gradient(90deg,#7f1d1d,#b91c1c 45%,#7f1d1d);color:#fff;",
    "font-family:'Inter',-apple-system,sans-serif;font-size:13.5px;line-height:1.45;",
    "box-shadow:0 2px 14px rgba(127,29,29,.45)}",
    "#cc-evac-banner .cc-eb-in{max-width:1240px;margin:0 auto;padding:9px 44px 9px 18px;",
    "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;position:relative}",
    "#cc-evac-banner .cc-eb-dot{width:8px;height:8px;border-radius:50%;background:#fecaca;flex:0 0 auto;",
    "box-shadow:0 0 0 0 rgba(254,202,202,.7);animation:ccEbPulse 1.8s infinite}",
    "@keyframes ccEbPulse{0%{box-shadow:0 0 0 0 rgba(254,202,202,.6)}70%{box-shadow:0 0 0 8px rgba(254,202,202,0)}100%{box-shadow:0 0 0 0 rgba(254,202,202,0)}}",
    "#cc-evac-banner .cc-eb-txt{color:rgba(255,255,255,.94)}",
    "#cc-evac-banner .cc-eb-txt b{font-weight:600}",
    "#cc-evac-banner a.cc-eb-btn{flex:0 0 auto;display:inline-block;background:#fff;color:#b91c1c;",
    "font-weight:700;font-size:12.5px;letter-spacing:.02em;padding:6px 14px;border-radius:999px;",
    "text-decoration:none;white-space:nowrap;transition:transform .15s ease,box-shadow .15s ease}",
    "#cc-evac-banner a.cc-eb-btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.3)}",
    "#cc-evac-banner .cc-eb-x{position:absolute;right:12px;top:50%;transform:translateY(-50%);",
    "background:none;border:none;color:rgba(255,255,255,.65);font-size:20px;line-height:1;",
    "cursor:pointer;padding:4px 6px}",
    "#cc-evac-banner .cc-eb-x:hover{color:#fff}",
    "@media(max-width:640px){",
    "#cc-evac-banner{font-size:12.5px}",
    "#cc-evac-banner .cc-eb-in{padding:8px 38px 8px 12px;gap:8px;justify-content:flex-start}",
    "#cc-evac-banner .cc-eb-txt .cc-eb-long{display:none}",
    "}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.id = "cc-evac-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Срочная эвакуация капитала");
  banner.innerHTML =
    '<div class="cc-eb-in">' +
      '<span class="cc-eb-dot" aria-hidden="true"></span>' +
      '<span class="cc-eb-txt"><b>Ситуация меняется быстро.</b>' +
      '<span class="cc-eb-long"> Если выводить капитал и защищать семью нужно уже сейчас — не ждите.</span></span>' +
      '<a class="cc-eb-btn" href="/evacuation.html">Эвакуация нужна сейчас →</a>' +
      '<button type="button" class="cc-eb-x" aria-label="Скрыть предупреждение">×</button>' +
    "</div>";

  function mount() {
    document.body.appendChild(banner);

    // сдвигаем fixed-топбар и hero вниз на высоту баннера
    function adjust() {
      var h = banner.offsetHeight;
      var topbar = document.getElementById("topbar");
      if (topbar) {
        var pos = getComputedStyle(topbar).position;
        if (pos === "fixed" || pos === "sticky") topbar.style.top = h + "px";
      }
      document.body.style.setProperty("margin-top", h + "px");
    }
    adjust();
    window.addEventListener("resize", adjust);

    banner.querySelector(".cc-eb-x").addEventListener("click", function () {
      banner.remove();
      var topbar = document.getElementById("topbar");
      if (topbar) topbar.style.top = "";
      document.body.style.removeProperty("margin-top");
      try { sessionStorage.setItem("cc_evac_banner_hidden", "1"); } catch (e) {}
    });

    banner.querySelector(".cc-eb-btn").addEventListener("click", function () {
      try { if (window.ym) ym(108969822, "reachGoal", "evac_banner_click"); } catch (e) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
