// RUB premiums are fixed coefficients; every service uses the same current CBR.
export const roundUpCents = (value) => Math.ceil((value - 1e-8) * 100) / 100;

export function moscowDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isIsoDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function isValidCbr(cbr) {
  return Boolean(cbr && cbr.currency === "USD" && Number.isFinite(cbr.rate) && cbr.rate > 0
    && isIsoDay(cbr.date) && isIsoDay(cbr.checkedFor) && cbr.date <= cbr.checkedFor
    && typeof cbr.verifiedAt === "string" && Number.isFinite(Date.parse(cbr.verifiedAt))
    && moscowDay(new Date(cbr.verifiedAt)) === cbr.checkedFor
    && typeof cbr.source === "string" && cbr.source.startsWith("https://www.cbr.ru/scripts/XML_daily.asp?date_req=")
    && typeof cbr.url === "string" && cbr.url.startsWith("https://www.cbr.ru/currency_base/daily/"));
}

export function isCurrentCbr(cbr, day = moscowDay()) {
  return isValidCbr(cbr) && cbr.checkedFor === day;
}

export function paymentRate(offer, cbr) {
  if (!offer || !Number.isFinite(offer.cost) || offer.cost < 0) return null;
  const rate = offer.currency === "USDT" && offer.cost < 1 ? 1 / (1 - offer.cost)
    : offer.currency === "RUB" && isValidCbr(cbr) ? cbr.rate * (1 + offer.cost) : null;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function paymentAmount(usd, offer, cbr) {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const rate = paymentRate(offer, cbr);
  const amount = rate === null ? null : roundUpCents(usd * rate);
  return Number.isFinite(amount) ? amount : null;
}

export function calculationConfirmed(usd, offer, cbr, day = moscowDay()) {
  return Boolean(offer?.own && paymentAmount(usd, offer, cbr) !== null
    && (offer.currency === "USDT" || isCurrentCbr(cbr, day)));
}
