import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculationDetails} from "../../thai-payments/assets/calculation-details.mjs";

const matrix = JSON.parse(readFileSync(new URL("../../thai-payments/offers.json", import.meta.url)));
const cbr = {...JSON.parse(readFileSync(new URL("../../thai-payments/cbr.json", import.meta.url))), rate:83.9153};
const arbi = matrix.offers.find((offer) => offer.id === "arbi-rub-online-2");
const ex24 = matrix.offers.find((offer) => offer.id === "ex24-usdt");

test("ARBI detail uses the full coefficient and separates incoming RUB from outgoing USD", () => {
  const detail = calculationDetails(26770, arbi, cbr);
  assert.equal(detail.usd, 26770);
  assert.equal(detail.total, 2514600);
  assert.equal(Number(detail.rate.toFixed(4)), 93.9335);
  assert.equal(Number(detail.difference.toFixed(2)), 268187.42);
});

test("USDT detail keeps input-fee math independent of CBR", () => {
  const detail = calculationDetails(26770, ex24, null);
  assert.equal(detail.total, 28000);
  assert.equal(detail.difference, 1230);
  assert.equal(detail.cbrRate, null);
});

test("changed USD and CBR produce new detail amounts, not a saved original quote", () => {
  const zeroPremium = {currency:"RUB",cost:0};
  assert.equal(calculationDetails(10000, zeroPremium, {...cbr,rate:90}).total, 900000);
  assert.equal(calculationDetails(33000, zeroPremium, {...cbr,rate:90}).total, 2970000);
});

test("invalid amount or absent RUB rate never becomes an invented detail amount", () => {
  for (const amount of [null,NaN,Infinity,-1,0,0.001,1e9+1]) assert.equal(calculationDetails(amount, arbi, cbr), null);
  assert.equal(calculationDetails(10000, arbi, null), null);
  assert.equal(calculationDetails(10000, {currency:"USDT",cost:1}, null), null);
});

test("detail model excludes private operator fields even when supplied", () => {
  const detail = calculationDetails(26770, {...arbi,receive:"PRIVATE_SENTINEL",send:"PRIVATE_SENTINEL",note:"PRIVATE_SENTINEL",quoteDate:"PRIVATE_SENTINEL"},cbr);
  assert.equal(JSON.stringify(detail).includes("PRIVATE_SENTINEL"),false);
});
