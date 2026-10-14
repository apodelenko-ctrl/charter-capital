// Native transform/opacity animations keep calculation values immediately accurate.
const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
const running = new Set();
const lastValues = new WeakMap();
const valueAnimations = new WeakMap();

function animate(element, frames, options = {}) {
  if (preference.matches || typeof element.animate !== "function") return null;
  const animation = element.animate(frames, {duration: 460, easing: "cubic-bezier(.22, 1, .36, 1)", ...options});
  running.add(animation);
  animation.finished.catch(() => {}).finally(() => running.delete(animation));
  return animation;
}

export function animateRows(container) {
  [...container.querySelectorAll("tr")].forEach((row, index) => {
    animate(row, [{opacity: 0, transform: "translateY(14px)"}, {opacity: 1, transform: "translateY(0)"}], {delay: Math.min(index * 38, 266), fill: "backwards"});
  });
}

export function animateValues(elements) {
  elements.forEach((element) => {
    const value = element.textContent;
    const previous = lastValues.get(element);
    lastValues.set(element, value);
    if (previous === value) return;
    valueAnimations.get(element)?.cancel();
    const animation = animate(element, [{opacity: .35, transform: "translateY(5px)"}, {opacity: 1, transform: "translateY(0)"}], {duration: 340});
    if (animation) valueAnimations.set(element, animation);
  });
}

export function initMotion() {
  document.documentElement.classList.add("motion-ready");
  const revealTargets = document.querySelectorAll(".hero-copy, .tariff-card, .calculator, .results-panel, .section-intro, .steps li, .methodology, .faq h2, .faq details, .closing");
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target, [{opacity: .1, transform: "translateY(24px)"}, {opacity: 1, transform: "translateY(0)"}], {duration: 680});
        observer.unobserve(entry.target);
      });
    }, {threshold: .12});
    revealTargets.forEach((element) => observer.observe(element));
  }
  preference.addEventListener("change", () => {
    if (preference.matches) running.forEach((animation) => animation.cancel());
  });

  const tickerWindow = document.getElementById("ticker-window");
  const track = document.getElementById("ticker-track");
  const pause = document.getElementById("ticker-pause");
  if (!tickerWindow || !track || !pause) return;
  const resize = () => track.style.setProperty("--ticker-width", `${tickerWindow.clientWidth}px`);
  resize();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(tickerWindow);
  else window.addEventListener("resize", resize, {passive: true});
  pause.addEventListener("click", () => {
    const paused = pause.getAttribute("aria-pressed") !== "true";
    pause.setAttribute("aria-pressed", String(paused));
    pause.setAttribute("aria-label", paused ? "Продолжить бегущую строку" : "Приостановить бегущую строку");
    pause.querySelector("span").textContent = paused ? "▷" : "Ⅱ";
    track.classList.toggle("is-paused", paused);
  });
}
