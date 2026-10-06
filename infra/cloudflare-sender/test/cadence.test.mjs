import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextCadenceAt,isNight} from '../src/cadence.mjs';
const paid={paid:true,interval_ms:300000,slowmode_ms:0},free={...paid,paid:false};
const time=s=>Date.parse('2026-10-06T'+s+':00+03:00');
test('Moscow night is 23:00 through 06:59, 25-minute paid minimum',()=>{
  assert.equal(isNight(time('22:59')),false);assert.equal(isNight(time('23:00')),true);
  assert.equal(isNight(time('06:59')),true);assert.equal(isNight(time('07:00')),false);
  assert.equal(nextCadenceAt(paid,time('01:00'),time('01:01')),time('01:25'));
});
test('cadence reevaluates across both night boundaries without catch-up bursts',()=>{
  assert.equal(nextCadenceAt(paid,time('22:59'),time('22:59')),time('23:24'));
  assert.equal(nextCadenceAt(paid,time('06:50'),time('06:51')),time('07:00'));
  assert.equal(nextCadenceAt(paid,time('06:58'),time('06:59')),time('07:03'));
  assert.equal(nextCadenceAt(paid,time('08:00'),time('09:00')),time('09:00'));
  assert.equal(nextCadenceAt(free,time('01:00'),time('01:01')),time('01:10'));
  assert.equal(nextCadenceAt({...paid,interval_ms:3600000},time('06:50'),time('06:51')),time('07:50'));
});
