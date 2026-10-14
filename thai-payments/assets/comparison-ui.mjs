import {parseAmount, readScenario, scenarioUrl} from './scenario.mjs';

const root = document.documentElement;
const amount = document.getElementById('usd-amount');
const method = document.getElementById('payment-method');
const search = document.getElementById('provider-search');
const sort = document.getElementById('offer-sort');
const rows = document.getElementById('offers-body');
const dialog = document.getElementById('offer-dialog');
const toast = document.getElementById('design-toast');
const initial = readScenario(location.search);
let scenarioApplied = false;
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {toast.hidden = true;}, 3500);
}

function currentScenario() {
  return {
    amount: parseAmount(amount.value),
    currency: document.querySelector('input[name="currency"]:checked')?.value,
    method: method.value,
    view: root.dataset.view || 'table',
  };
}

function setView(view) {
  root.dataset.view = view;
  document.querySelectorAll('button[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

async function copyText(text, success) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    notify(success);
  } catch {
    const fallback = document.getElementById(dialog.open ? 'copy-fallback' : 'share-fallback');
    fallback.hidden = false;
    fallback.value = text;
    fallback.focus();
    fallback.select();
    notify('Текст выделен. Скопируйте его удобным способом.');
  }
}

function updateDesignUI() {
  if (!rows.children.length && !scenarioApplied) return;
  if (!scenarioApplied) {
    scenarioApplied = true;
    setView(initial.view);
    const radio = document.querySelector(`input[name="currency"][value="${initial.currency}"]`);
    if (initial.hasAmount) amount.value = initial.amount === null ? '' : String(initial.amount);
    method.value = initial.method;
    if (radio && !radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', {bubbles:true}));
    }
    amount.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  const scenario = currentScenario();
  const share = scenarioUrl(location.href, scenario);
  document.getElementById('share-calculation').disabled = share === null;
  if (scenario.amount === null) document.getElementById('copy-calculation').disabled = true;
  document.getElementById('clear-all-filters').hidden = !search.value && method.value === 'all' && sort.value === 'cost-asc';
  document.getElementById('mobile-offer-count').textContent = document.getElementById('result-count').textContent;
  document.querySelectorAll('[data-design-link]').forEach(link => {
    if (share) link.href = scenarioUrl(new URL(link.dataset.designLink, location.href), scenario);
  });
  // Incoming RUB can exceed the allowed USD input maximum; do not apply that
  // input cap to a displayed payment amount.
  const total = node => {
    const clean = node.textContent.replace(/₽|USDT|\s/g,'').replace(',','.');
    const value = Number(clean);
    return /^\d+(?:\.\d{1,2})?$/.test(clean) && Number.isFinite(value) && value > 0 ? value : null;
  };
  const amounts = [...rows.querySelectorAll('.cell-amount')].filter(node => total(node) !== null);
  const lowest = amounts.reduce((min, node) => !min || total(node) < total(min) ? node : min, null);
  document.getElementById('lowest-total').textContent = lowest?.textContent || '—';
  document.getElementById('lowest-provider').textContent = lowest?.closest('tr')?.querySelector('.provider-name')?.textContent.replace(/\s*i\s*$/, '').trim()
    || (scenario.amount === null ? 'Укажите сумму для расчёта' : !rows.children.length ? 'Нет предложений по выбранным фильтрам' : 'Курс ЦБ уточняется');
}

document.addEventListener('payment-rendered', updateDesignUI);
setView(initial.view);
document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => {setView(button.dataset.view); updateDesignUI();}));
document.getElementById('share-calculation').addEventListener('click', () => copyText(scenarioUrl(location.href, currentScenario()), 'Ссылка на расчёт скопирована'));
document.getElementById('clear-all-filters').addEventListener('click', () => document.getElementById('reset-filters').click());
document.getElementById('copy-calculation').addEventListener('click', () => {
  const pay = document.getElementById('detail-pay')?.textContent;
  const receive = document.getElementById('detail-receive')?.textContent;
  if (!pay || pay === '—' || !receive || receive === '—') return;
  const details = [...document.querySelectorAll('#dialog-content .detail-block')].slice(0, 3).map(section => section.innerText.trim());
  const text = [
    'Перевод для оплаты недвижимости',
    document.getElementById('dialog-title').textContent,
    `Вы отдаёте: ${pay}`,
    `Продавец получает: ${receive}`,
    ...details,
    scenarioUrl(location.href, currentScenario()),
    'Перед проведением сделки уточните актуальность расчёта напрямую у исполнителя.',
  ].filter(Boolean).join('\n');
  copyText(text, 'Расчёт скопирован');
});
dialog.addEventListener('close', () => {document.getElementById('copy-fallback').hidden = true;});
updateDesignUI();
