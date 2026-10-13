"use strict";
import {paymentRate, paymentAmount, calculationConfirmed, isValidCbr, moscowDay} from "./calculation.mjs?v=20261013-4";

const ui = {
  amount: document.getElementById("usd-amount"),
  amountError: document.getElementById("amount-error"),
  method: document.getElementById("payment-method"),
  methodControl: document.getElementById("method-control"),
  search: document.getElementById("provider-search"),
  sort: document.getElementById("offer-sort"),
  body: document.getElementById("offers-body"),
  count: document.getElementById("result-count"),
  empty: document.getElementById("empty-state"),
  dialog: document.getElementById("offer-dialog"),
  title: document.getElementById("compare-title"),
  costHeading: document.getElementById("cost-heading"),
  amountHeading: document.getElementById("amount-heading"),
  context: document.getElementById("comparison-context"),
  total: document.getElementById("calc-total"),
  percent: document.getElementById("calc-percent"),
  rate: document.getElementById("calc-rate"),
  fee: document.getElementById("calc-fee"),
  cbr: document.getElementById("cbr-link"),
  cbrMethod: document.getElementById("method-cbr-link"),
  benchmark: document.getElementById("benchmark-context"),
  confirmation: document.getElementById("charter-status"),
  request: document.getElementById("request-link"),
  closing: document.getElementById("closing-request"),
};

let data;
let currency = "RUB";
let validAmount = true;
const money = new Intl.NumberFormat("ru-RU", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const shortNumber = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 2});
const rateNumber = new Intl.NumberFormat("ru-RU", {minimumFractionDigits: 4, maximumFractionDigits: 4});
const percentage = new Intl.NumberFormat("ru-RU", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const dateLabel = (date) => date.split("-").reverse().join(".");
const symbol = (curr) => curr === "RUB" ? "₽" : "USDT";
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function amountValue() {
  const clean = ui.amount.value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 1e9 ? amount : null;
}

function charterOffer() {
  const rub = currency === "RUB";
  const offer = {
    id: "charter-" + currency.toLowerCase(),
    providerId: "charter-capital",
    name: "Charter Capital",
    website: "https://ccapital.pro/",
    variant: rub ? "RUB · ЦБ + 3%" : "USDT · 2,5% от внесённой суммы",
    currency,
    cost: rub ? data.charter.rubPremium : data.charter.usdtInputFee,
    own: true,
    receive: "Финансирование платежа в RUB или USDT.",
    send: "Оплата инвойса застройщика в USD. Маршрут подготавливаем по инвойсу.",
    note: "RUB: 3% к курсу ЦБ. USDT: 2,5% от внесённой суммы при допущении 1 USDT = 1 USD.",
  };
  return {...offer, rate: paymentRate(offer, data.cbr)};
}

function confirmation(offer, amount) {
  const confirmed = calculationConfirmed(amount, offer, data.cbr);
  const text = confirmed ? "Актуальность расчёта подтверждена"
    : amount === null ? "Укажите сумму для расчёта"
    : !data.cbr ? "Курс ЦБ временно недоступен" : "Требуется обновление курса ЦБ";
  return {confirmed, text};
}

function updateBenchmark() {
  ui.cbr.hidden = currency === "USDT";
  const cbr = data.cbr;
  if (cbr) {
    ui.cbr.href = cbr.url;
    ui.cbr.innerHTML = `ЦБ РФ · на ${dateLabel(cbr.checkedFor)}<br><strong>${rateNumber.format(cbr.rate)} ₽ за 1 USD</strong> <span aria-hidden="true">↗</span>`;
    ui.cbrMethod.href = cbr.url;
    ui.cbrMethod.textContent = `ЦБ РФ · на ${dateLabel(cbr.checkedFor)} ↗`;
  } else {
    ui.cbr.removeAttribute("href");
    ui.cbr.textContent = "Курс ЦБ временно недоступен";
    ui.cbrMethod.href = "https://www.cbr.ru/currency_base/daily/";
    ui.cbrMethod.textContent = "ЦБ РФ · официальный курс ↗";
  }
  ui.benchmark.textContent = currency === "USDT" ? "Процент от внесённых USDT"
    : cbr ? `ЦБ ${rateNumber.format(cbr.rate)} ₽/USD · ${dateLabel(cbr.checkedFor)}` : "Получаем курс ЦБ";
}

function draftUrl(amount) {
  const text = `Здравствуйте! Хочу оплатить недвижимость в Таиланде через Charter Capital.\nК зачислению: ${shortNumber.format(amount)} USD.\nОплата: ${currency}.\nПрошу подтвердить итоговую сумму, расходы банков, маршрут и документы.\nhttps://ccapital.pro/thai-payments/`;
  return data.charter.contact + "?text=" + encodeURIComponent(text);
}

function updateCalculator(amount) {
  const own = charterOffer();
  ui.percent.textContent = currency === "RUB" ? "3%" : "2,5%";
  ui.rate.textContent = own.rate === null ? "Курс ЦБ недоступен" : `${rateNumber.format(own.rate)} ${currency === "RUB" ? "₽" : "USDT"} за 1 USD`;
  const status = confirmation(own, amount);
  ui.confirmation.textContent = status.text;
  ui.confirmation.className = `calculation-status ${status.confirmed ? "confirmed" : "pending"}`;
  if (amount === null) {
    ui.total.textContent = "—";
    ui.fee.textContent = "Укажите сумму к зачислению";
    [ui.request, ui.closing].forEach((link) => {link.setAttribute("aria-disabled", "true"); link.removeAttribute("href");});
    return;
  }
  const total = paymentAmount(amount, own, data.cbr);
  ui.total.textContent = total === null ? "—" : `${money.format(total)} ${symbol(currency)}`;
  const fee = total === null ? null : currency === "RUB" ? total - amount * data.cbr.rate : total - amount;
  ui.fee.textContent = fee === null ? "Запросите расчёт у менеджера" : `${currency === "RUB" ? "Надбавка к ЦБ" : "2,5% от внесённых USDT"}: ${money.format(fee)} ${symbol(currency)}`;
  [ui.request, ui.closing].forEach((link) => {link.removeAttribute("aria-disabled"); link.href = draftUrl(amount);});
}

function resultWord(number) {
  const lastTwo = number % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "предложений";
  if (number % 10 === 1) return "предложение";
  return [2, 3, 4].includes(number % 10) ? "предложения" : "предложений";
}

function filteredOffers() {
  const query = ui.search.value.trim().toLocaleLowerCase("ru-RU");
  const matches = (offer) => !query || `${offer.name} ${offer.variant}`.toLocaleLowerCase("ru-RU").includes(query);
  const competitors = data.offers.filter((offer) => offer.currency === currency && (currency !== "RUB" || ui.method.value === "all" || offer.method === ui.method.value) && matches(offer))
    .map((offer) => ({...offer, rate: paymentRate(offer, data.cbr)}));
  competitors.sort((a, b) => ui.sort.value === "name-asc" ? a.name.localeCompare(b.name, "ru") || a.cost - b.cost : ui.sort.value === "cost-desc" ? b.cost - a.cost : a.cost - b.cost);
  const own = charterOffer();
  // Cash availability has not been quoted for Charter Capital. Do not imply it.
  const includeOwn = matches(own) && (currency !== "RUB" || ui.method.value !== "cash");
  return includeOwn ? [own, ...competitors] : competitors;
}

function offerRow(offer, amount) {
  const rateUnit = currency === "RUB" ? "₽/USD" : "USDT/USD";
  const total = paymentAmount(amount, offer, data.cbr);
  const amountText = total === null ? "—" : `${money.format(total)} ${symbol(currency)}`;
  const costSub = currency === "RUB" ? "к курсу ЦБ" : "от внесённых USDT";
  const status = offer.own ? confirmation(offer, amount) : null;
  const statusText = status ? `<span class="row-confirmation ${status.confirmed ? "confirmed" : "pending"}">${escapeHtml(status.text)}</span>` : "";
  const rateText = offer.rate === null ? "Курс ЦБ недоступен" : `${rateNumber.format(offer.rate)} ${rateUnit}`;
  const initials = {"charter-capital":"C", "ex24":"24", "arbi-exchange":"A", "grusha-agency":"G", "the-one-exchange":"1"};
  const link = offer.own ? ui.request.href || data.charter.contact : offer.website;
  const actions = offer.own
    ? `<a class="button primary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Запросить <span aria-hidden="true">↗</span></a><button type="button" class="details-button" data-offer="${escapeHtml(offer.id)}">Условия</button>`
    : `<button type="button" class="details-button" data-offer="${escapeHtml(offer.id)}">Путь денег <span aria-hidden="true">↗</span></button><a class="site-link" href="${escapeHtml(offer.website)}" target="_blank" rel="noopener noreferrer">Сайт сервиса ↗</a>`;
  return `<tr${offer.own ? ' class="charter-row"' : ""} data-offer-row="${escapeHtml(offer.id)}">
    <td><div class="provider-cell"><span class="provider-avatar" aria-hidden="true">${initials[offer.providerId]}</span><div class="provider-meta">${offer.own ? '<span class="own-badge">НАШ СЕРВИС</span><br>' : ""}<a class="provider-name" href="${escapeHtml(offer.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(offer.name)}</a><span class="provider-variant">${escapeHtml(offer.variant)}</span>${statusText}</div></div></td>
    <td data-label="${currency === "RUB" ? "К курсу ЦБ" : "Стоимость"}"><strong class="cell-value">${currency === "RUB" ? "+" : ""}${percentage.format(offer.cost * 100)}%</strong><span class="cell-sub">${escapeHtml(costSub)}</span></td>
    <td data-label="${offer.own ? "По тарифу Charter Capital" : "Расчёт по проценту сервиса"}"><strong class="cell-amount">${amountText}</strong><span class="cell-sub">${rateText}</span></td>
    <td><div class="row-actions">${actions}</div></td></tr>`;
}

function render() {
  if (!data) return;
  const amount = amountValue();
  validAmount = amount !== null;
  ui.amount.setAttribute("aria-invalid", String(!validAmount));
  ui.amountError.hidden = validAmount;
  ui.amountError.textContent = validAmount ? "" : "Введите сумму от 0,01 до 1 000 000 000 USD, до двух знаков после запятой.";
  ui.title.textContent = `${currency} → USD в Таиланд`;
  ui.methodControl.hidden = currency !== "RUB";
  ui.costHeading.textContent = currency === "RUB" ? "К курсу ЦБ" : "Стоимость";
  ui.amountHeading.textContent = `Отдаёте, ${currency}`;
  ui.context.textContent = amount === null ? "Введите сумму для расчёта" : `Расчёт на ${shortNumber.format(amount)} USD`;
  updateBenchmark();
  updateCalculator(amount);
  const offers = filteredOffers();
  ui.body.innerHTML = offers.map((offer) => offerRow(offer, amount)).join("");
  ui.count.textContent = `${offers.length} ${resultWord(offers.length)}`;
  ui.empty.hidden = offers.length > 0;
}

function detailBlock(title, text, extraClass = "") {
  return `<section class="detail-block"><h3>${escapeHtml(title)}</h3><p${extraClass ? ` class="${extraClass}"` : ""}>${escapeHtml(text)}</p></section>`;
}

function openOffer(id) {
  const sourceOffer = id.startsWith("charter-") ? charterOffer() : data.offers.find((item) => item.id === id);
  const offer = sourceOffer ? {...sourceOffer, rate: paymentRate(sourceOffer, data.cbr)} : null;
  if (!offer) return;
  ui.dialog.querySelector("#dialog-title").textContent = offer.name;
  ui.dialog.querySelector("#dialog-variant").textContent = offer.variant;
  const amount = amountValue();
  const total = paymentAmount(amount, offer, data.cbr);
  const value = total === null ? "Укажите сумму или запросите расчёт у менеджера." : `${shortNumber.format(amount)} USD → ${money.format(total)} ${symbol(offer.currency)} к внесению`;
  let content = detailBlock("Расчёт для вашей суммы", value, "detail-quote");
  content += detailBlock("Процент сервиса", `${percentage.format(offer.cost * 100)}% ${offer.currency === "RUB" ? "к курсу ЦБ" : "от внесённых USDT при паритете 1 USDT = 1 USD"}.`);
  if (offer.currency === "RUB" && data.cbr) content += detailBlock("Курс ЦБ для расчёта", `${rateNumber.format(data.cbr.rate)} ₽ за 1 USD. Сумма = USD × курс ЦБ × (1 + процент сервиса ÷ 100).`);
  if (offer.own) {
    const status = confirmation(offer, amount);
    content += detailBlock("Charter Capital", status.text, `calculation-status ${status.confirmed ? "confirmed" : "pending"}`);
  }
  content += detailBlock("Как принимают деньги", offer.receive);
  content += detailBlock("Как отправляют платёж", offer.send);
  content += detailBlock("Условия", offer.note);
  ui.dialog.querySelector("#dialog-content").innerHTML = content;
  const destination = ui.dialog.querySelector("#dialog-website");
  destination.href = offer.own && validAmount ? draftUrl(amountValue()) : offer.website;
  destination.textContent = offer.own ? "Запросить расчёт ↗" : "Перейти на сайт ↗";
  ui.dialog.showModal();
}

document.querySelectorAll('input[name="currency"]').forEach((input) => input.addEventListener("change", () => {currency = input.value; render();}));
[ui.amount, ui.search].forEach((input) => input.addEventListener("input", render));
[ui.method, ui.sort].forEach((select) => select.addEventListener("change", render));
document.querySelectorAll("button[data-amount]").forEach((button) => button.addEventListener("click", () => {ui.amount.value = button.dataset.amount; render();}));
ui.body.addEventListener("click", (event) => {const button = event.target.closest("button[data-offer]"); if (button) openOffer(button.dataset.offer);});
document.getElementById("reset-filters").addEventListener("click", () => {ui.search.value = ""; ui.method.value = "all"; ui.sort.value = "cost-asc"; render();});
[document.getElementById("close-dialog"), document.getElementById("dialog-done")].forEach((button) => button.addEventListener("click", () => ui.dialog.close()));
ui.dialog.addEventListener("click", (event) => {if (event.target === ui.dialog) {const bounds = ui.dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ui.dialog.close();}});
[ui.request, ui.closing].forEach((link) => link.addEventListener("click", (event) => {if (!validAmount) event.preventDefault();}));

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {cache: "no-cache", signal: controller.signal});
    if (!response.ok) throw new Error("Data unavailable");
    return await response.json();
  } finally {clearTimeout(timeout);}
}

let refreshing = false;
async function refreshCbr() {
  if (!data || refreshing) return;
  refreshing = true;
  try {
    const cbr = await fetchJson("cbr.json");
    if (!isValidCbr(cbr) || cbr.checkedFor > moscowDay()) throw new Error("Invalid CBR data");
    data.cbr = cbr;
  } catch {
    // Keep the last verified value, but the current-day check removes confirmation when stale.
  } finally {refreshing = false; render();}
}

async function init() {
  try {
    const loaded = await fetchJson("offers.json");
    if (loaded.model !== "fixed-percentages" || !Array.isArray(loaded.offers)
      || !Number.isFinite(loaded.charter?.rubPremium) || loaded.charter.rubPremium < 0
      || !Number.isFinite(loaded.charter?.usdtInputFee) || loaded.charter.usdtInputFee < 0 || loaded.charter.usdtInputFee >= 1
      || loaded.offers.some((offer) => !Number.isFinite(offer.cost) || offer.cost < 0 || !["RUB", "USDT"].includes(offer.currency) || (offer.currency === "USDT" && offer.cost >= 1))) throw new Error("Invalid percentage data");
    data = {...loaded, cbr: null};
    render();
    await refreshCbr();
    setInterval(() => {if (document.visibilityState !== "hidden") refreshCbr();}, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {if (document.visibilityState === "visible") refreshCbr();});
  } catch {
    document.getElementById("load-error").hidden = false;
    ui.count.textContent = "Данные сервисов недоступны";
    ui.total.textContent = "Уточните у менеджера";
    ui.fee.textContent = "";
    ui.rate.textContent = "";
    validAmount = false;
  }
}
init();
