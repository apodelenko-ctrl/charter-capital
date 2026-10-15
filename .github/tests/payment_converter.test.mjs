import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertPayment, parsePaymentAmount, isValidBankReference, isCurrentBankReference, BANK_URL} from '../../property-payments/assets/payment-converter.mjs';
const now = new Date('2026-10-15T07:00:00Z');
const cbr = {currency:'USD', rate:83.9497, date:'2026-10-15', checkedFor:'2026-10-15', verifiedAt:'2026-10-15T06:00:00Z', source:'https://www.cbr.ru/scripts/XML_daily.asp?date_req=15/10/2026', url:'https://www.cbr.ru/currency_base/daily/?UniDbQuery.To=15.10.2026'};
const bank = {provider:'Bangkok Bank', pair:'USD/THB', type:'sight-bill-buying', rate:33.32, publishedAt:'2026-10-15T08:30:00+07:00', checkedAt:'2026-10-15T06:00:00Z', source:BANK_URL, url:BANK_URL};
const calculate = params => convertPayment({cbr, bank, now, ...params});

test('both budget and recipient target match independent Decimal fixtures for five sums and all four pairs', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/charter_converter_decimal.json', import.meta.url)));
  assert.equal(fixtures.cases.length, 40);
  for (const item of fixtures.cases) {
    const result = calculate(item.input);
    assert.ok(result, JSON.stringify(item.input));
    for (const field of ['give','receive','usd','fee']) assert.equal(result[field], item.expected[field], JSON.stringify(item.input) + ' ' + field);
  }
});
test('a RUB budget never commits more than entered, and USD cents are rounded down', () => {
  const q = calculate({amount:1000000, side:'give', receiveCurrency:'THB'});
  assert.equal(q.give,1000000); assert.equal(q.usd,11564.94); assert.equal(q.receive,385343.8);
  assert(q.usd * cbr.rate * 1.03 <= q.give);
});
test('a THB target rounds the SWIFT and required funding up, including fractional baht', () => {
  for (const amount of [0.01,100000,1000000.55,3000000]) {
    const q = calculate({amount, side:'receive', receiveCurrency:'THB'});
    assert(q.receive >= amount); assert(q.receive - amount < bank.rate / 100 + .01);
    assert(q.give >= q.usd*cbr.rate*1.03 - 1e-8);
  }
});
test('USDT fee is 2.5 percent of the incoming amount, not the USD target', () => {
  const budget = calculate({amount:25000, giveCurrency:'USDT', receiveCurrency:'THB'});
  assert.equal(budget.usd,24375); assert.equal(budget.fee,625); assert.equal(budget.receive,812175);
  const target = calculate({amount:10000, side:'receive', giveCurrency:'USDT', receiveCurrency:'USD'});
  assert.equal(target.give,10256.42); assert.equal(target.fee,256.42);
});
test('USD results do not depend on a bank snapshot; USDT results do not depend on CBR', () => {
  assert.equal(calculate({amount:25000,giveCurrency:'USDT',receiveCurrency:'USD',cbr:null,bank:null}).receive,24375);
  assert.ok(calculate({amount:10000,giveCurrency:'RUB',receiveCurrency:'USD',bank:null}));
  assert.ok(calculate({amount:25000,giveCurrency:'USDT',receiveCurrency:'THB',cbr:null}));
});
test('TT, malformed, future and incorrect-origin bank rates cannot produce THB', () => {
  for (const change of [{type:'TT-buying'},{rate:0},{rate:NaN},{url:'https://example.test'},{source:'https://example.test'},{pair:'RUB/THB'},{publishedAt:'broken'},{checkedAt:'2026-10-16T06:00:00Z'}]) {
    const value={...bank,...change}; assert.equal(isValidBankReference(value,now),false);
    assert.equal(calculate({amount:1000000,bank:value}),null);
  }
});
test('a dated prior-day bank reference is labelled unconfirmed, not silently marked current', () => {
  const previous={...bank,publishedAt:'2026-10-14T08:30:00+07:00',checkedAt:'2026-10-14T06:00:00Z'};
  assert.equal(isCurrentBankReference(previous,now),false);
  assert.equal(calculate({amount:1000000,bank:previous}).bankCheckedToday,false);
});
test('invalid and future CBR values do not produce RUB quotes', () => {
  for (const value of [null,{...cbr,rate:0},{...cbr,rate:1e-10},{...cbr,checkedFor:'2026-10-16',date:'2026-10-16',verifiedAt:'2026-10-16T06:00:00Z'}]) assert.equal(calculate({amount:1000000,cbr:value}),null);
});
test('input validation accepts Russian separators and rejects negatives, exponent notation and extra precision', () => {
  assert.equal(parsePaymentAmount('26\u202f770,55'),26770.55);
  assert.equal(parsePaymentAmount('1 000 000.00'),1000000);
  for(const value of ['',null,'-1','1e6','1.001','1,2,3','Infinity','1000000001',0]) assert.equal(parsePaymentAmount(value),null);
  for(const side of ['bad','']) assert.equal(calculate({amount:25000,side}),null);
});
test('tiny budgets never promise a wire amount below one cent', () => {
  assert.equal(calculate({amount:.01,giveCurrency:'RUB'}),null);
  assert.equal(calculate({amount:.01,giveCurrency:'USDT'}),null);
});
