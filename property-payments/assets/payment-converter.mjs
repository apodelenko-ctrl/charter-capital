import {isValidCbr, isCurrentCbr, moscowDay} from './calculation.mjs';

export const BANK_URL = 'https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates';
export const TARIFF = Object.freeze({rubPremium: 0.03, usdtInputFee: 0.025});

export function parsePaymentAmount(value) {
  const clean = String(value ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
  const number = Number(clean);
  return Number.isFinite(number) && number >= 0.01 && number <= 1e9 ? number : null;
}

const ceilDivide = (a, b) => (a + b - 1n) / b;
function rational(value) {
  const [whole, fraction = ''] = String(value).split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,8}$/.test(fraction)) return null;
  return {n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length)};
}
function cents(value) {
  const r = rational(value);
  return r && r.n * 100n % r.d === 0n ? r.n * 100n / r.d : null;
}
function safeMoney(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) / 100 : null;
}
export function bangkokDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
}
export function isValidBankReference(bank, now = new Date()) {
  if (!bank || bank.provider !== 'Bangkok Bank' || bank.pair !== 'USD/THB' || bank.type !== 'sight-bill-buying'
    || !Number.isFinite(bank.rate) || bank.rate <= 0 || bank.rate > 1000
    || bank.url !== BANK_URL || bank.source !== BANK_URL) return false;
  const published = Date.parse(bank.publishedAt), checked = Date.parse(bank.checkedAt);
  return Number.isFinite(published) && Number.isFinite(checked) && published <= checked
    && checked <= now.getTime() + 60000;
}
export function isCurrentBankReference(bank, now = new Date()) {
  return isValidBankReference(bank, now) && bangkokDay(new Date(bank.checkedAt)) === bangkokDay(now);
}

/** SWIFT is sent in USD. THB is an estimate at the dated receiving-bank reference.
 * Integer rational arithmetic rounds USD/THB down for a budget and funding up for a target.
 * Banks' additional charges are agreed separately and are not invented here.
 */
export function convertPayment({amount, side = 'give', giveCurrency = 'RUB', receiveCurrency = 'THB', cbr = null, bank = null, now = new Date()} = {}) {
  const parsed = parsePaymentAmount(amount);
  if (parsed === null || !['give','receive'].includes(side) || !['RUB','USDT'].includes(giveCurrency) || !['THB','USD'].includes(receiveCurrency)) return null;
  if (giveCurrency === 'RUB' && (!isValidCbr(cbr) || cbr.checkedFor > moscowDay(now)
    || Date.parse(cbr.verifiedAt) > now.getTime() + 60000)) return null;
  if (receiveCurrency === 'THB' && !isValidBankReference(bank, now)) return null;
  const input = cents(parsed);
  if (input === null) return null;
  const cbrRate = giveCurrency === 'RUB' ? rational(cbr.rate) : null;
  if (giveCurrency === 'RUB' && !cbrRate) return null;
  // 3% above CBR USD; 2.5% of incoming USDT at the stated 1:1 parity.
  const cost = giveCurrency === 'RUB' ? {n:cbrRate.n * 103n, d:cbrRate.d * 100n} : {n:40n, d:39n};
  const fx = receiveCurrency === 'THB' ? rational(bank.rate) : {n:1n, d:1n};
  if (!cost || !fx) return null;
  const usdCents = side === 'give' ? input * cost.d / cost.n : ceilDivide(input * fx.d, fx.n);
  if (usdCents <= 0n) return null;
  const giveCents = side === 'give' ? input : ceilDivide(usdCents * cost.n, cost.d);
  const receivedCents = usdCents * fx.n / fx.d;
  if (receivedCents <= 0n) return null;
  const baseCents = giveCurrency === 'RUB' ? usdCents * cbrRate.n / cbrRate.d : usdCents;
  const values = {give:safeMoney(giveCents), receive:safeMoney(receivedCents), usd:safeMoney(usdCents), fee:safeMoney(giveCents-baseCents)};
  if (Object.values(values).some(v => v === null)) return null;
  return {...values, requested:parsed, side, giveCurrency, receiveCurrency,
    inputPerOutput:Number(cost.n) / Number(cost.d) / (Number(fx.n) / Number(fx.d)),
    tariffCurrent:giveCurrency === 'USDT' || isCurrentCbr(cbr, moscowDay(now)),
    bankCheckedToday:receiveCurrency === 'USD' || isCurrentBankReference(bank, now),
    bankReference:receiveCurrency === 'THB' ? bank : null};
}
