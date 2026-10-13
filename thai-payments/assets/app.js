"use strict";

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
const roundUpCents = (value) => Math.ceil((value - 1e-8) * 100) / 100;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function amountValue() {
  const clean = ui.amount.value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 1e9 ? amount : null;
}

function charterOffer() {
  const rub = currency === "RUB";
  return {
    id: "charter-" + currency.toLowerCase(),
    providerId: "charter-capital",
    name: "Charter Capital",
    website: "https://ccapital.pro/",
    variant: rub ? "RUB · способ приёма согласуем" : "USDT · маршрут по инвойсу",
    currency,
    rate: rub ? data.cbr.rate * (1 + data.charter.rubPremium) : 1 / (1 - data.charter.usdtInputFee),
    cost: rub ? data.charter.rubPremium : data.charter.usdtInputFee,
    date: data.charter.date,
    dateKind: "Тариф",
    own: true,
    cbr: rub ? data.cbr : undefined,
    receive: "Тариф для финансирования платежа в RUB или USDT. Способ приёма, реквизиты и договор согласуются по конкретному инвойсу. Наличная котировка Charter Capital в подборке не заявлена.",
    send: "Банк, фактический отправитель USD, сумма к зачислению и пакет документов согласуются при подготовке платежа. Эта страница не фиксирует отдельный банковский маршрут.",
    note: "RUB: 3% к курсу ЦБ. USDT: 2,5% от внесённой суммы при допущении 1 USDT = 1 USD. Итоговые расходы банков и условия конвертации в THB уточняются до оплаты.",
  };
}

function draftUrl(amount) {
  const text = `Здравствуйте! Хочу оплатить недвижимость в Таиланде через Charter Capital.\nК зачислению: ${shortNumber.format(amount)} USD.\nОплата: ${currency}.\nПрошу подтвердить итоговую сумму, расходы банков, маршрут и документы.\nhttps://ccapital.pro/thai-payments/`;
  return data.charter.contact + "?text=" + encodeURIComponent(text);
}

function updateCalculator(amount) {
  const own = charterOffer();
  ui.percent.textContent = currency === "RUB" ? "3%" : "2,5%";
  ui.rate.textContent = `${rateNumber.format(own.rate)} ${currency === "RUB" ? "₽" : "USDT"} за 1 USD`;
  ui.cbr.hidden = currency === "USDT";
  if (amount === null) {
    ui.total.textContent = "—";
    ui.fee.textContent = "Укажите сумму к зачислению";
    [ui.request, ui.closing].forEach((link) => {link.setAttribute("aria-disabled", "true"); link.removeAttribute("href");});
    return;
  }
  const total = roundUpCents(amount * own.rate);
  ui.total.textContent = `${money.format(total)} ${symbol(currency)}`;
  const fee = currency === "RUB" ? total - amount * data.cbr.rate : total - amount;
  ui.fee.textContent = `${currency === "RUB" ? "Надбавка к ЦБ" : "2,5% от внесённых USDT"}: ${money.format(fee)} ${symbol(currency)}`;
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
  const competitors = data.offers.filter((offer) => offer.currency === currency && (currency !== "RUB" || ui.method.value === "all" || offer.method === ui.method.value) && matches(offer));
  competitors.sort((a, b) => ui.sort.value === "date-desc" ? b.date.localeCompare(a.date) || a.cost - b.cost : ui.sort.value === "cost-desc" ? b.cost - a.cost : a.cost - b.cost);
  const own = charterOffer();
  // Cash availability has not been quoted for Charter Capital. Do not imply it.
  const includeOwn = matches(own) && (currency !== "RUB" || ui.method.value !== "cash");
  return includeOwn ? [own, ...competitors] : competitors;
}

function offerRow(offer, amount) {
  const rateUnit = currency === "RUB" ? "₽/USD" : "USDT/USD";
  const amountText = amount === null ? "—" : `${money.format(roundUpCents(amount * offer.rate))} ${symbol(currency)}`;
  const costSub = currency === "RUB" ? `ЦБ · ${dateLabel(offer.cbr.date)}` : "от внесённых USDT";
  const initials = {"charter-capital":"C", "ex24":"24", "arbi-exchange":"A", "grusha-agency":"G", "the-one-exchange":"1"};
  const link = offer.own ? ui.request.href || data.charter.contact : offer.website;
  const actions = offer.own
    ? `<a class="button primary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Запросить <span aria-hidden="true">↗</span></a><button type="button" class="details-button" data-offer="${escapeHtml(offer.id)}">Условия</button>`
    : `<button type="button" class="details-button" data-offer="${escapeHtml(offer.id)}">Путь денег <span aria-hidden="true">↗</span></button><a class="site-link" href="${escapeHtml(offer.website)}" target="_blank" rel="noopener noreferrer">Сайт сервиса ↗</a>`;
  return `<tr${offer.own ? ' class="charter-row"' : ""} data-offer-row="${escapeHtml(offer.id)}">
    <td><div class="provider-cell"><span class="provider-avatar" aria-hidden="true">${initials[offer.providerId]}</span><div class="provider-meta">${offer.own ? '<span class="own-badge">НАШ СЕРВИС</span><br>' : ""}<a class="provider-name" href="${escapeHtml(offer.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(offer.name)}</a><span class="provider-variant">${escapeHtml(offer.variant)}</span></div></div></td>
    <td data-label="${currency === "RUB" ? "К курсу ЦБ" : "Стоимость"}"><strong class="cell-value">${currency === "RUB" ? "+" : ""}${percentage.format(offer.cost * 100)}%</strong><span class="cell-sub">${escapeHtml(costSub)}</span></td>
    <td data-label="${offer.own ? "По тарифу Charter Capital" : "Пример по котировке"}"><strong class="cell-amount">${amountText}</strong><span class="cell-sub">${rateNumber.format(offer.rate)} ${rateUnit}<br>${offer.dateKind} · ${dateLabel(offer.date)}</span></td>
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
  const offer = id.startsWith("charter-") ? charterOffer() : data.offers.find((item) => item.id === id);
  if (!offer) return;
  ui.dialog.querySelector("#dialog-title").textContent = offer.name;
  ui.dialog.querySelector("#dialog-variant").textContent = `${offer.variant} · ${offer.dateKind.toLowerCase()} ${dateLabel(offer.date)}`;
  const original = offer.own ? `Тариф: ${currency === "RUB" ? "ЦБ + 3%" : "2,5% от внесённых USDT"}.` : `${shortNumber.format(offer.inputAmount)} ${symbol(offer.currency)} → ${shortNumber.format(offer.outputUsd)} USD`;
  let content = detailBlock(offer.own ? "Стоимость Charter Capital" : "Исходная котировка", original, "detail-quote");
  if (offer.cbr) {
    content += `<section class="detail-block"><h3>Как получен процент</h3><p>Курс ${rateNumber.format(offer.rate)} RUB/USD ÷ курс ЦБ ${rateNumber.format(offer.cbr.rate)} − 1 = ${percentage.format(offer.cost * 100)}%. <a href="${escapeHtml(offer.cbr.url)}" target="_blank" rel="noopener noreferrer">ЦБ на ${dateLabel(offer.cbr.date)} ↗</a></p></section>`;
  } else if (!offer.own) {
    content += detailBlock("Как получен процент", `(${shortNumber.format(offer.inputAmount)} − ${shortNumber.format(offer.outputUsd)}) ÷ ${shortNumber.format(offer.inputAmount)} × 100% = ${percentage.format(offer.cost * 100)}%. Принят паритет 1 USDT = 1 USD.`);
  }
  content += detailBlock("Как принимают деньги", offer.receive);
  content += detailBlock("Как отправляют платёж", offer.send);
  content += detailBlock("Что уточнить до оплаты", offer.note);
  if (!offer.own) content += detailBlock("Для вашей суммы", "Число в таблице пересчитано по сохранённому курсу. Это пример, а не подтверждённая новая котировка. Цена и расходы банков требуют согласования с сервисом.");
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

async function init() {
  try {
    const response = await fetch("offers.json", {cache: "no-cache"});
    if (!response.ok) throw new Error("Quotes are unavailable");
    const loaded = await response.json();
    if (!Array.isArray(loaded.offers) || !Number.isFinite(loaded.cbr?.rate) || loaded.cbr.rate <= 0) throw new Error("Invalid quote data");
    data = loaded;
    render();
  } catch {
    document.getElementById("load-error").hidden = false;
    ui.count.textContent = "Котировки недоступны";
    ui.total.textContent = "Уточните у менеджера";
    ui.fee.textContent = "";
    ui.rate.textContent = "";
    validAmount = false;
  }
}
init();
