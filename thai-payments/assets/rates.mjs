import {isValidCbr, isCurrentCbr} from "./calculation.mjs?v=20261013-4";

const bankUrl = "https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates";
const bankFeed = "https://www.bangkokbank.com/api/exchangerateservice/GetLatestfxrates";
const number = (value, decimals) => new Intl.NumberFormat("ru-RU", {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(value);
const shortDate = (value) => value.slice(0, 10).split("-").reverse().slice(0, 2).join(".");

export function isValidBankRate(rate) {
  return Boolean(rate && rate.provider === "Bangkok Bank" && rate.pair === "USD/THB" && rate.type === "TT-buying"
    && Number.isFinite(rate.rate) && rate.rate > 0
    && typeof rate.publishedAt === "string" && Number.isFinite(Date.parse(rate.publishedAt))
    && typeof rate.checkedAt === "string" && Number.isFinite(Date.parse(rate.checkedAt))
    && Date.parse(rate.publishedAt) <= Date.parse(rate.checkedAt)
    && rate.url === bankUrl && [bankUrl, bankFeed].includes(rate.source));
}

export function tickerEntries(cbr, bank, now = new Date()) {
  const validCbr = isValidCbr(cbr);
  const format = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"});
  const validBank = isValidBankRate(bank) && Date.parse(bank.checkedAt) <= now.getTime() + 60000;
  const currentBank = validBank && format.format(new Date(bank.checkedAt)) === format.format(now);
  const bankTime = validBank ? new Intl.DateTimeFormat("ru-RU", {timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit"}).format(new Date(bank.publishedAt)) : "";
  const bankDate = validBank ? new Intl.DateTimeFormat("ru-RU", {timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit"}).format(new Date(bank.publishedAt)) : "";
  return [
    {pair: "THB / RUB", value: validCbr && Number.isFinite(cbr.thbRub) && cbr.thbRub > 0 ? `1 THB = ${number(cbr.thbRub, 5)} ₽` : "Курс THB уточняется", source: validCbr ? `ЦБ РФ · ${shortDate(cbr.checkedFor)}` : "ЦБ РФ", url: validCbr ? cbr.url : "https://www.cbr.ru/currency_base/daily/", stale: validCbr && !isCurrentCbr(cbr)},
    {pair: "USD / RUB", value: validCbr ? `1 USD = ${number(cbr.rate, 4)} ₽` : "Курс USD уточняется", source: validCbr ? `ЦБ РФ · ${shortDate(cbr.checkedFor)}` : "ЦБ РФ", url: validCbr ? cbr.url : "https://www.cbr.ru/currency_base/daily/", stale: validCbr && !isCurrentCbr(cbr)},
    {pair: "USD / THB", value: currentBank ? `1 USD = ${number(bank.rate, 2)} THB` : "Курс банка уточняется", source: validBank ? `Bangkok Bank · TT · ${bankDate} ${bankTime}` : "Bangkok Bank · покупка TT", url: bankUrl, stale: validBank && !currentBank},
  ];
}
