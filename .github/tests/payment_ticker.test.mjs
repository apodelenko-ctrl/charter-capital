import test from "node:test";
import assert from "node:assert/strict";
import {tickerEntries, isValidBankRate} from "../../thai-payments/assets/rates.mjs";
import {readFileSync} from "node:fs";
const cbr = JSON.parse(readFileSync(new URL("../../thai-payments/cbr.json", import.meta.url)));
const bank = {provider:"Bangkok Bank", pair:"USD/THB", type:"sight-bill-buying", rate:33.35, publishedAt:"2026-10-12T15:15:00+07:00", checkedAt:"2026-10-13T10:00:00Z", source:"https://www.bangkokbank.com/api/exchangerateservice/GetLatestfxrates", url:"https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates"};
const now = new Date("2026-10-13T12:00:00Z");

test("ticker labels the price of one THB and one USD, not the CBR nominal of ten baht", () => {
  const entries = tickerEntries({...cbr, rate:83.9153, thbRub:2.50337}, bank, now);
  assert.equal(entries[0].value, "1 THB = 2,50337 ₽");
  assert.equal(entries[1].value, "1 USD = 83,9153 ₽");
  assert.equal(entries[2].value, "1 USD = 33,35 THB");
  assert.match(entries[2].source, /Sight Bill Buying Rates · 12\.10 15:15/);
});

test("TT is rejected rather than silently displayed as Sight Bill", () => {
  const tt = {...bank, type:"TT-buying", rate:33.45};
  assert.equal(isValidBankRate(tt), false);
  const entry = tickerEntries(cbr, tt, now)[2];
  assert.equal(entry.value, "Курс банка уточняется");
  assert.equal(entry.source, "Bangkok Bank · Sight Bill Buying Rates");
});

test("bank quote date and time use Bangkok timezone, including a UTC date boundary", () => {
  const entry = tickerEntries(cbr, {...bank, publishedAt:"2026-10-11T18:00:00Z"}, now)[2];
  assert.match(entry.source, /12\.10 01:00/);
  assert.equal(entry.stale, false);
  const old = tickerEntries(cbr, {...bank, checkedAt:"2026-10-12T10:00:00Z"}, now)[2];
  assert.equal(old.stale, true);
  assert.equal(old.value, "Курс банка уточняется");
});

test("missing, future or mismatched rates are never replaced by invented numbers", () => {
  for (const changed of [{type:"bank-notes"}, {pair:"RUB/THB"}, {rate:0}, {rate:NaN}, {url:"https://example.com"}, {publishedAt:"invalid"}]) {
    assert.equal(isValidBankRate({...bank, ...changed}), false);
  }
  assert.equal(tickerEntries(null, null, now)[1].value, "Курс USD уточняется");
  assert.equal(tickerEntries(cbr, {...bank, checkedAt:"2026-10-14T10:00:00Z"}, now)[2].value, "Курс банка уточняется");
});
