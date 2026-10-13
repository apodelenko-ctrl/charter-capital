import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {paymentRate, paymentAmount, isCurrentCbr, isValidCbr, moscowDay, calculationConfirmed} from "../../thai-payments/assets/calculation.mjs";

const cbr = (rate = 83.9153) => ({
  currency: "USD", rate, date: "2026-10-13", checkedFor: "2026-10-13",
  verifiedAt: "2026-10-13T06:00:00Z",
  source: "https://www.cbr.ru/scripts/XML_daily.asp?date_req=13/10/2026",
  url: "https://www.cbr.ru/currency_base/daily/?UniDbQuery.To=13.10.2026",
});
const rub = {currency: "RUB", cost: 0.03, own: true};
const usdt = {currency: "USDT", cost: 0.025, own: true};

test("10,000 USD: Charter RUB and USDT use their different percentage bases", () => {
  assert.equal(paymentAmount(10000, rub, cbr()), 864327.59);
  assert.equal(paymentAmount(10000, usdt, null), 10256.42);
  assert.ok(paymentAmount(10000, usdt, null) * 0.975 >= 10000);
});

test("new CBR changes every RUB amount, leaving service percentages untouched", () => {
  const offers = JSON.parse(readFileSync(new URL("../../thai-payments/offers.json", import.meta.url))).offers;
  for (const offer of offers.filter(item => item.currency === "RUB")) {
    const originalPercentage = offer.cost;
    const oldRate = paymentRate(offer, cbr(80));
    const newRate = paymentRate(offer, cbr(90));
    assert.ok(Math.abs(newRate / oldRate - 90 / 80) < 1e-12, offer.id);
    assert.equal(offer.cost, originalPercentage);
    assert.ok(paymentAmount(33000, offer, cbr(90)) > paymentAmount(33000, offer, cbr(80)));
  }
});

test("legacy quoted rates cannot override the current percentage model", () => {
  const offer = {currency: "RUB", cost: 0.05, rate: 123, cbr: {rate: 100}, date: "2020-01-01"};
  assert.equal(paymentAmount(10000, offer, cbr(80)), 840000);
});

test("USDT calculations are independent of CBR", () => {
  assert.equal(paymentAmount(30000, usdt, cbr(80)), paymentAmount(30000, usdt, cbr(100)));
});

test("confirmation requires a valid amount and today's CBR for RUB", () => {
  assert.equal(calculationConfirmed(10000, rub, cbr(), "2026-10-13"), true);
  assert.equal(calculationConfirmed(10000, rub, cbr(), "2026-10-14"), false);
  assert.equal(calculationConfirmed(null, rub, cbr(), "2026-10-13"), false);
  assert.equal(calculationConfirmed(10000, {...rub, own: false}, cbr(), "2026-10-13"), false);
  assert.equal(calculationConfirmed(10000, usdt, null, "2026-10-14"), true);
});

test("an official prior working-day rate checked today remains current", () => {
  assert.equal(isCurrentCbr({...cbr(), date: "2026-10-09"}, "2026-10-13"), true);
  assert.equal(isValidCbr({...cbr(), date: "2026-10-14"}), false);
  assert.equal(isValidCbr({...cbr(), checkedFor: "2026-10-14"}), false);
  assert.equal(isValidCbr({...cbr(), verifiedAt: "invalid"}), false);
});

test("missing or malformed CBR never produces a RUB value or confirmed badge", () => {
  for (const bad of [null, cbr(0), cbr(-1), cbr(Infinity), {...cbr(), source: "https://example.com/"}]) {
    assert.equal(paymentAmount(10000, rub, bad), null);
    assert.equal(calculationConfirmed(10000, rub, bad, "2026-10-13"), false);
  }
});

test("invalid amounts, percentages and overflow cannot become a payment amount", () => {
  for (const amount of [0, -1, null, NaN, Infinity]) assert.equal(paymentAmount(amount, rub, cbr()), null);
  for (const cost of [-0.01, 1, NaN, Infinity]) assert.equal(paymentAmount(10000, {...usdt, cost}, cbr()), null);
  assert.equal(paymentAmount(Number.MAX_VALUE, rub, cbr()), null);
});

test("CBR calendar uses Moscow midnight even on another local timezone", () => {
  assert.equal(moscowDay(new Date("2026-10-13T20:59:00Z")), "2026-10-13");
  assert.equal(moscowDay(new Date("2026-10-13T21:01:00Z")), "2026-10-14");
});

test("public matrix contains nine unique variants without original quote dates or amounts", () => {
  const matrix = JSON.parse(readFileSync(new URL("../../thai-payments/offers.json", import.meta.url)));
  assert.equal(matrix.model, "fixed-percentages");
  assert.equal(matrix.offers.length, 9);
  assert.equal(new Set(matrix.offers.map(item => item.id)).size, 9);
  for (const offer of matrix.offers) for (const field of ["date", "dateKind", "inputAmount", "outputUsd", "cbr", "rate"]) assert.equal(field in offer, false);
});
