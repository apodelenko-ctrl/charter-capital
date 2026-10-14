import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerContext,partnerContactUrl} from '../../property-payments/assets/service-model.mjs';
const code='tp_'+'a'.repeat(20),visit='v_'+'b'.repeat(20);
test('Charter Pay accepts only bounded public referral and correlation codes',()=>{
 assert.deepEqual(partnerContext('?ref='+code+'&tp_visit='+visit),{code,visit});
 for(const ref of ['someone@example.test','https://evil.test','<script>','tp_123',code+'x'])assert.deepEqual(partnerContext('?ref='+encodeURIComponent(ref)+'&tp_visit='+visit),{code:null,visit:null});
 assert.deepEqual(partnerContext('?ref='+code+'&tp_visit=wrong'),{code,visit:null});
});
test('Charter Pay contact preserves the partner, amount and funding through the fixed portal endpoint',()=>{
 const url=new URL(partnerContactUrl('?ref='+code,'26 770,55','USDT'));
 assert.equal(url.origin,'https://thaipay.pro');assert.equal(url.pathname,'/go/contact');assert.equal(url.searchParams.get('ref'),code);assert.equal(url.searchParams.get('usd'),'26770.55');assert.equal(url.searchParams.get('currency'),'USDT');
});
test('ordinary Charter Pay contacts remain unchanged; invalid amounts are not invented',()=>{
 assert.equal(partnerContactUrl('',25000,'RUB'),null);
 const url=new URL(partnerContactUrl('?ref='+code,'-1','BAD'));assert(!url.searchParams.has('usd'));assert.equal(url.searchParams.get('currency'),'RUB');
});
