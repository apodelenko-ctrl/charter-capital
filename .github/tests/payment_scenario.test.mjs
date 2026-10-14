import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount, readScenario, scenarioUrl} from '../../thai-payments/assets/scenario.mjs';

test('shared calculation restores the amount, funding currency and cash filter', () => {
  assert.deepEqual(readScenario('?usd=33000.25&currency=RUB&method=cash&view=cards'), {amount:33000.25,currency:'RUB',method:'cash',view:'cards',hasAmount:true});
});
test('USDT never inherits a RUB cash or bank filter', () => {
  assert.equal(readScenario('?usd=26770&currency=USDT&method=cash').method, 'all');
});
test('invalid and oversized link amounts stay invalid instead of replacing the calculation silently', () => {
  for (const usd of ['0','-1','1e6','1000000001','10.123','<script>']) {
    const state=readScenario('?usd='+encodeURIComponent(usd));
    assert.equal(state.hasAmount,true);assert.equal(state.amount,null);
  }
});
test('sharing strips unrelated auth and private query parameters', () => {
  const url=scenarioUrl('https://example.com/designs/emerald/?token=do-not-copy&customer=private#compare', {amount:10000,currency:'USDT',method:'cash',view:'table'});
  assert.equal(url,'https://example.com/designs/emerald/?usd=10000&currency=USDT');
});
test('decimal comma, spaces, fractional minimum and maximum are accepted consistently', () => {
  assert.equal(parseAmount('33 000,25'),33000.25);
  assert.equal(parseAmount('.01'),null);
  assert.equal(parseAmount('0.01'),.01);
  assert.equal(parseAmount('1000000000'),1e9);
});
test('unexpected currency, method, view and URL scheme cannot turn the share button into another action', () => {
  assert.equal(readScenario('?currency=BTC&method=wire&view=other').currency,'RUB');
  assert.equal(scenarioUrl('javascript:alert(1)',{amount:10,currency:'RUB'}),null);
  assert.equal(scenarioUrl('https://example.com/',{amount:0,currency:'RUB'}),null);
});
