import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeLedger} from './helpers.mjs';
import {snapshot,NOW} from './fixtures.mjs';
const source={discovery_enabled:false,final:true,parity_complete:true,paused:true,stopped_marker:true,archive_sha256:'a'.repeat(64)};
const input={archive_sha256:source.archive_sha256,attempts:1,evidence:'Owner authorized cloud cutover; stopped Mac and backup verified.'};
const old={id:'old',chat_id:-100123,created:NOW-1,status:'uncertain',digest:'preserve'};
function make(overrides={}){return makeLedger(snapshot({source,halt:'source_dispatcher_disabled_requires_review',attempts:[old],blocked:[{chat_id:-100123,reason:'original hold'}],...overrides}));}
test('cutover acknowledgement only clears the reviewed source-stop halt and preserves history',()=>{
  const {ledger:l,db}=make();const before=l.exportSnapshot();l.setMeta('preflight',{kind:'ready'});
  const status=l.acknowledgeCutover(input,NOW);const after=l.exportSnapshot();
  assert.equal(status.enabled,false);assert.equal(status.halt,'');assert.equal(status.attempts.uncertain,1);
  for(const name of ['attempts','imported_attempts','paid_variants','visibility','blocked','groups','archive'])assert.deepEqual(after[name],before[name]);
  assert.equal(after.reviews.length,1);assert.equal(JSON.parse(after.reviews[0].body).kind,'authorized_cutover');
  assert.equal(l.meta('preflight'),null);assert.equal(after.control.epoch,before.control.epoch+1);
  assert.throws(()=>l.acknowledgeCutover(input,NOW),/refused/);db.close();
});
test('cutover acknowledgement cannot clear account/uncertainty halts, pending, or unverified snapshots',()=>{
  for(const overrides of [{halt:'account_requires_review'},{halt:'uncertain_delivery_requires_review'},
    {attempts:[{...old,status:'pending'}]},{source:{...source,paused:false}},{source:{...source,final:false}},{source:{...source,parity_complete:false}}]){
    const {ledger:l,db}=make(overrides);assert.throws(()=>l.acknowledgeCutover(input,NOW),/refused/);db.close();
  }
  for(const changed of [{archive_sha256:'b'.repeat(64)},{attempts:2},{evidence:'yes'}]){
    const {ledger:l,db}=make();assert.throws(()=>l.acknowledgeCutover({...input,...changed},NOW),/refused/);db.close();
  }
});
test('recent observation is bounded and read-only while sender is enabled',()=>{
  const attempts=Array.from({length:105},(_,i)=>({...old,id:String(i),status:'sent',created:NOW-105+i,message_id:String(i+1)}));
  const {ledger:l,db}=makeLedger(snapshot({attempts}));l.activate();const epoch=l.control().epoch;
  const recent=l.recent();assert.equal(recent.length,100);assert.equal(recent[0].id,'104');
  assert.equal(l.control().enabled,1);assert.equal(l.control().epoch,epoch);assert.equal(l.status().attempts.sent,105);db.close();
});
