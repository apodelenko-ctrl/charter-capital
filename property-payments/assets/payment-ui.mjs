import {isValidCbr, moscowDay} from './calculation.mjs';
import {convertPayment, parsePaymentAmount, isValidBankReference} from './payment-converter.mjs?v=20261015-thb-1';
import {referralContext, partnerContext, partnerContactUrl} from './service-model.mjs?v=20261015-links-1';
import {initMotion, animateValues} from './motion.mjs?v=charter-pay-1';

const $ = id => document.getElementById(id);
const give = $('service-give'), receive = $('service-receive-amount');
const giveCurrency = $('service-give-currency'), receiveCurrency = $('service-receive-currency');
const number = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2});
const rateNumber = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:4, maximumFractionDigits:4});
const short = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
const amountText = (value, currency) => number.format(value) + ' ' + (currency === 'RUB' ? '₽' : currency);
const bankDate = value => new Intl.DateTimeFormat('ru-RU', {timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
let side = 'give', cbr = null, bank = null, quote = null;
const input = () => side === 'give' ? give : receive;

function messageText() {
  const lines = ['Здравствуйте! Хочу оплатить недвижимость в Таиланде через Charter Pay.'];
  if (quote) {
    lines.push('Вношу: ' + amountText(quote.give, giveCurrency.value) + '.',
      (receiveCurrency.value === 'THB' ? 'Ориентир получателю: ' : 'Получателю: ') + amountText(quote.receive, receiveCurrency.value) + '.',
      'SWIFT-перевод: ' + amountText(quote.usd, 'USD') + '.');
    if (quote.bankReference) lines.push('Ориентир THB по Bangkok Bank Sight Bill Buying Rates от ' + bankDate(bank.publishedAt) + '.');
  } else {
    const amount = parsePaymentAmount(input().value);
    if (amount !== null) lines.push((side === 'give' ? 'Бюджет: ' : 'Нужно получателю: ') + amountText(amount, side === 'give' ? giveCurrency.value : receiveCurrency.value) + '.');
    lines.push('Внесение: ' + giveCurrency.value + '; валюта расчёта получателя: ' + receiveCurrency.value + '.');
  }
  lines.push('Прошу согласовать окончательный расчёт, расходы банков и агентский договор.');
  if (referralContext(location.search).fromAggregator) lines.push('Источник: ThaiPay.');
  return lines.join('\n');
}
function contactUrl() {
  const tracked = partnerContactUrl(location.search, quote?.usd, giveCurrency.value);
  if (tracked) return tracked;
  const url = new URL('https://t.me/ccapital_acces');
  url.searchParams.set('text', messageText()); return url.href;
}
function copyText() {
  const context = partnerContext(location.search);
  const lines = ['Charter Pay · оплата недвижимости в Таиланде',
    'Вы отдаёте: ' + amountText(quote.give, giveCurrency.value),
    'Получатель: ' + (receiveCurrency.value === 'THB' ? '≈ ' : '') + amountText(quote.receive, receiveCurrency.value),
    'SWIFT: ' + amountText(quote.usd, 'USD'), 'Тариф: ' + $('service-percent').textContent,
    'Ваши затраты на перевод: ' + $('service-fee').textContent];
  if (giveCurrency.value === 'RUB') lines.push($('service-cbr').textContent);
  if (quote.bankReference) lines.push($('service-bank').textContent);
  lines.push('THB — ориентир после конвертации USD банком получателя. Окончательный курс и расходы банков согласуются до оплаты.', 'https://ccapital.pro/property-payments/');
  if (context.code) lines.push('Рекомендация ThaiPay: ' + context.code + (context.visit ? ' · Код обращения: ' + context.visit : ''));
  return lines.join('\n');
}
function renderQuickAmounts() {
  const currency = side === 'give' ? giveCurrency.value : receiveCurrency.value;
  const values = {RUB:[100000,500000,1000000], USDT:[10000,25000,100000], THB:[100000,1000000,3000000], USD:[10000,26770,100000]}[currency];
  $('quick-label').textContent = side === 'give' ? 'Быстрый выбор бюджета' : 'Быстрый выбор суммы получателю';
  document.querySelectorAll('[data-amount]').forEach((button, index) => {
    button.dataset.amount = String(values[index]); button.textContent = short.format(values[index]);
    button.setAttribute('aria-label', short.format(values[index]) + ' ' + currency);
  });
}
function render() {
  const amount = parsePaymentAmount(input().value), thb = receiveCurrency.value === 'THB';
  quote = convertPayment({amount, side, giveCurrency:giveCurrency.value, receiveCurrency:receiveCurrency.value, cbr, bank});
  const opposite = side === 'give' ? receive : give;
  opposite.value = quote ? number.format(side === 'give' ? quote.receive : quote.give) : '';
  give.closest('.converter-field').classList.toggle('is-source', side === 'give');
  receive.closest('.converter-field').classList.toggle('is-source', side === 'receive');
  give.setAttribute('aria-invalid', String(side === 'give' && amount === null));
  receive.setAttribute('aria-invalid', String(side === 'receive' && amount === null));
  $('service-error').hidden = amount !== null;
  $('service-percent').textContent = giveCurrency.value === 'RUB' ? 'ЦБ + 3%' : '2,5% от внесённых USDT';
  $('service-result-label').textContent = side === 'give' ? (thb ? 'Ориентир к зачислению' : 'Получатель получает') : 'Потребуется внести';
  $('service-total').textContent = quote ? (side === 'give' && thb ? '≈ ' : '') + amountText(side === 'give' ? quote.receive : quote.give, side === 'give' ? receiveCurrency.value : giveCurrency.value) : '—';
  $('service-usd').textContent = quote ? amountText(quote.usd, 'USD') : '—';
  $('service-rate').textContent = quote ? '1 ' + receiveCurrency.value + ' ≈ ' + rateNumber.format(quote.inputPerOutput) + ' ' + (giveCurrency.value === 'RUB' ? '₽' : 'USDT') : 'Уточняется';
  $('service-fee').textContent = quote ? amountText(quote.fee, giveCurrency.value) + (giveCurrency.value === 'RUB' ? ' к ЦБ' : '') : '—';
  const current = quote && quote.tariffCurrent && quote.bankCheckedToday;
  $('service-status').textContent = amount === null ? 'Введите корректную сумму в любом из двух полей.'
    : !quote ? ((giveCurrency.value === 'USDT' || cbr) && (!thb || bank)
      ? 'После расчёта сумма меньше одного цента USD. Увеличьте бюджет или запросите расчёт у менеджера.'
      : 'Курс загружается или недоступен. Можно запросить расчёт у менеджера.')
    : !quote.tariffCurrent ? 'Показан справочный расчёт. Курс ЦБ требует обновления.'
    : thb ? (current ? 'Тариф Charter Pay подтверждён. THB — ориентир по курсу банка.' : 'Справочный расчёт по последнему опубликованному курсу банка.')
    : 'Актуальность расчёта подтверждена при переводе через Charter Pay';
  $('service-status').className = 'calculation-status ' + (current ? 'confirmed' : 'pending');
  $('service-cbr').hidden = giveCurrency.value !== 'RUB';
  if (cbr) { $('service-cbr').href = cbr.url; $('service-cbr').textContent = 'ЦБ РФ · ' + cbr.date.split('-').reverse().join('.') + ' · 1 USD = ' + rateNumber.format(cbr.rate) + ' ₽ ↗'; }
  $('service-bank').hidden = !thb;
  if (bank) { $('service-bank').href = bank.url; $('service-bank').textContent = 'Bangkok Bank · Sight Bill Buying Rates · 1 USD = ' + short.format(bank.rate) + ' THB · ' + bankDate(bank.publishedAt) + ' (Бангкок) ↗'; }
  $('service-thb-note').hidden = !thb;
  $('service-rounding-note').hidden = !(quote && side === 'receive' && thb && quote.receive > amount);
  if (quote && side === 'receive' && thb) $('service-rounding-note').textContent = 'После округления SWIFT до центов ориентир: ' + amountText(quote.receive, 'THB') + '.';
  const url = contactUrl(); document.querySelectorAll('[data-payment-contact]').forEach(link => {link.href = url;});
  $('service-copy').disabled = !quote; $('copy-status').textContent = ''; $('copy-fallback').hidden = true;
  const example = convertPayment({amount:10000, side:'receive', giveCurrency:'RUB', receiveCurrency:'USD', cbr});
  $('example-rub').textContent = example ? amountText(example.give, 'RUB') : 'Получаем курс ЦБ';
  renderQuickAmounts(); animateValues([$('service-total')]);
}
async function json(url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try { const response = await fetch(url, {cache:'no-cache', signal:controller.signal}); if (!response.ok) throw new Error('Unavailable'); return await response.json(); }
  finally {clearTimeout(timer);}
}
async function refresh() {
  await Promise.allSettled([
    (async () => {const value = await json('/thai-payments/cbr.json'); if (isValidCbr(value) && value.checkedFor <= moscowDay()) cbr = value;})(),
    (async () => {const value = await json('./bangkok-bank.json'); if (isValidBankReference(value)) bank = value;})(),
  ]); render();
}
give.addEventListener('input', () => {side = 'give'; render();});
receive.addEventListener('input', () => {side = 'receive'; render();});
giveCurrency.addEventListener('change', render); receiveCurrency.addEventListener('change', render);
document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => {input().value = button.dataset.amount; render();}));
$('service-copy').addEventListener('click', async () => {
  if (!quote) return; const text = copyText();
  try {await navigator.clipboard.writeText(text); $('copy-status').textContent = 'Расчёт скопирован';}
  catch {$('copy-fallback').value = text; $('copy-fallback').hidden = false; $('copy-fallback').focus(); $('copy-fallback').select(); $('copy-status').textContent = 'Выделите и скопируйте расчёт из поля ниже.';}
});
$('service-motion').addEventListener('click', () => {
  const paused = document.body.classList.toggle('motion-paused'); $('service-motion').setAttribute('aria-pressed', String(paused));
  $('service-motion').setAttribute('aria-label', paused ? 'Продолжить анимацию изображения' : 'Приостановить анимацию изображения');
  $('service-motion').textContent = paused ? '▷' : 'Ⅱ';
});
const context = referralContext(location.search);
if (context.amount !== null) {side = 'receive'; receiveCurrency.value = 'USD'; receive.value = String(context.amount);}
giveCurrency.value = context.currency;
document.querySelectorAll('a[href^="https://t.me/ccapital_acces"]').forEach(link => {link.dataset.paymentContact = 'true';});
initMotion(); render(); await refresh();
setInterval(() => {if (document.visibilityState === 'visible') refresh();}, 300000);
document.addEventListener('visibilitychange', () => {if (document.visibilityState === 'visible') refresh();});
