import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Ledger,HOUR} from '../src/ledger.mjs';
import {NOW,group,snapshot} from './fixtures.mjs';
function setup(s=snapshot()) {
  const db=new DatabaseSync(':memory:');
  const storage={sql:{exec(query,...params){
    if (query.includes('CREATE TABLE')) {db.exec(query);return {toArray:()=>[]};}
    const stmt=db.prepare(query);const rows=stmt.all(...params);return {toArray:()=>rows};
  }},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const l=new Ledger(storage);l.importSnapshot(s,NOW);return l;
}
test('import is paused and cannot overwrite existing state',()=>{
  const l=setup();assert.equal(l.status().enabled,false);assert.equal(l.claim(NOW,'1','1'),null);
  assert.throws(()=>l.importSnapshot(snapshot(),NOW),/already_initialized/);
});
test('paid 5-minute minimum and free 10-minute minimum',()=>{
  for (const paid of [true,false]) {
    const l=setup(snapshot({groups:[group({paid,interval_ms:1000})]}));l.activate();
    const j=l.claim(NOW,'a','1');assert.ok(j);l.finish(j,{kind:'sent',message_id:1},NOW);
    const interval=paid?300_000:600_000;
    assert.equal(l.claim(NOW+interval-1,'b','2'),null);assert.ok(l.claim(NOW+interval,'b','2'));
  }
});
test('group rules and slowmode override requested frequency',()=>{
  const l=setup(snapshot({groups:[group({interval_ms:900_000,slowmode_ms:1_200_000})]}));l.activate();
  const j=l.claim(NOW,'a','1');l.finish(j,{kind:'sent',message_id:1},NOW);
  assert.equal(l.claim(NOW+900_000,'b','2'),null);assert.ok(l.claim(NOW+1_200_000,'b','2'));
});
test('paid_until required and expiry checked again after prepare',()=>{
  assert.throws(()=>setup(snapshot({groups:[group({paid_until:null})]})),/paid_terms/);
  const l=setup(snapshot({groups:[group({paid_until:NOW+1000})]}));l.activate();const j=l.claim(NOW,'a','1');
  assert.equal(l.validClaim(j,NOW+1000),false);
});
test('pending prevents concurrent claim; restart becomes uncertain and stopped',()=>{
  const l=setup(snapshot({groups:[group(),group({chat_id:-100456})]}));l.activate();l.claim(NOW,'a','1');
  assert.equal(l.claim(NOW,'b','2'),null);l.recover();
  assert.equal(l.status().enabled,false);assert.equal(l.status().attempts.uncertain,1);assert.throws(()=>l.activate(),/blocked/);
});
test('network ambiguity never becomes success or a replay',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.finish(j,{kind:'uncertain'},NOW);
  assert.equal(l.claim(NOW+HOUR,'b','2'),null);assert.equal(l.status().attempts.uncertain,1);
});
test('global FloodWait persists and applies to other groups',()=>{
  const l=setup(snapshot({groups:[group(),group({chat_id:-100456})]}));l.activate();
  const j=l.claim(NOW,'a','1');l.finish(j,{kind:'flood',retry_after_ms:700_000},NOW);
  assert.equal(l.claim(NOW+699_999,'b','2'),null);assert.ok(l.claim(NOW+700_000,'b','2'));
});
test('stop during request cannot be overwritten by successful response',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.stop();
  assert.equal(l.validClaim(j,NOW),false);l.finish(j,{kind:'sent',message_id:42},NOW);
  assert.equal(l.status().enabled,false);assert.equal(l.status().attempts.sent,1);
});
test('import preserves uncertain, external sends, waits and off-registry blocked peers',()=>{
  const attempts=[{id:'old',chat_id:-100123,created:NOW-1,status:'uncertain',digest:'old'},
    {id:'external',chat_id:-100456,created:NOW-1,status:'sent_external',digest:'old',message_id:'99'}];
  const l=setup(snapshot({attempts,wait_until:NOW+HOUR,blocked:[{chat_id:-100999,reason:'old_hold'}]}));
  assert.deepEqual(l.status().attempts,{sent_external:1,uncertain:1});assert.equal(l.status().blocked_groups,1);
  l.activate();assert.equal(l.claim(NOW,'a','1'),null);assert.equal(l.claim(NOW+HOUR,'a','1'),null);
});
test('daily ceilings count failed/uncertain attempts, not only successes',()=>{
  const l=setup(snapshot({daily_limit:1}));l.activate();const j=l.claim(NOW,'a','1');
  l.finish(j,{kind:'preflight_failed'},NOW);assert.equal(l.claim(NOW+HOUR,'b','2'),null);
});
test('hourly report is idempotent and counts [start,end) with external separately',()=>{
  const attempts=[{id:'a',chat_id:-100123,created:NOW-HOUR,status:'sent',digest:'x'},
    {id:'b',chat_id:-100123,created:NOW-1,status:'sent_external',digest:'x'},
    {id:'c',chat_id:-100123,created:NOW,status:'uncertain',digest:'x'}];
  const l=setup(snapshot({attempts}));const r=l.hourly(NOW);
  assert.deepEqual(r.attempts,{sent:1,sent_external:1});assert.equal(r.unresolved_now.uncertain,1);
  assert.deepEqual(l.hourly(NOW),r);
});
test('invalid import rolls back rather than leaving half a history',()=>{
  const a={id:'duplicate',chat_id:-100123,created:NOW,status:'sent',digest:'x'};
  assert.throws(()=>setup(snapshot({attempts:[a,a]})),/UNIQUE/);
});
test('rolling counters preserve exact 24-hour boundary across bucket edges',()=>{
  const attempts=[
    {id:'a',chat_id:-100123,created:NOW-24*HOUR,status:'sent',digest:'x'},
    {id:'b',chat_id:-100123,created:NOW-24*HOUR+1,status:'failed',digest:'x'},
    {id:'c',chat_id:-100123,created:NOW-HOUR,status:'sent_external',digest:'x'},
  ];
  const l=setup(snapshot({attempts}));assert.equal(l.used(0,NOW),2);
  assert.equal(l.used(-100123,NOW+1),1);assert.equal(l.used(0,NOW+24*HOUR),0);
});
test('scheduler sleeps until next due and stops scheduling expired groups',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.finish(j,{kind:'sent',message_id:1},NOW);
  assert.equal(l.nextWake(NOW),NOW+300_000);assert.equal(l.nextWake(NOW+24*HOUR),null);
});
test('synthetic 24-hour load: 8 paid and 17 free, no burst catch-up',()=>{
  const groups=Array.from({length:25},(_,i)=>group({chat_id:-100000-i,paid:i<8,valid_until:NOW+2*24*HOUR,paid_until:NOW+2*24*HOUR}));
  const l=setup(snapshot({groups}));l.activate();let now=NOW,n=0;
  while(now<NOW+24*HOUR) {
    const job=l.claim(now,String(n),String(n+1));
    if(job){l.finish(job,{kind:'sent',message_id:n+1},now);n++;}
    now=l.nextWake(now);if(now==null)break;
  }
  assert.ok(n>4000 && n<4752);assert.equal(l.status().attempts.sent,n);
});
test('approved free live-refresh works after expiry; paid expiry cannot refresh',()=>{
  const l=setup(snapshot({groups:[group({paid:false,refresh_on_live_check:true,valid_until:NOW-1})]}));
  l.activate();assert.ok(l.claim(NOW,'a','1'));assert.ok(l.nextWake(NOW));
  assert.throws(()=>setup(snapshot({groups:[group({refresh_on_live_check:true})]})),/paid_refresh/);
});
test('restart preserves imported pending record while stopping ambiguous delivery',()=>{
  const a={id:'157',chat_id:-100123,created:NOW-1,status:'pending',digest:'x',source_created:(NOW-1)/1000};
  const l=setup(snapshot({attempts:[a]}));assert.equal(l.status().attempts.pending,1);
  l.recover();assert.equal(l.status().attempts.uncertain,1);
  assert.deepEqual(JSON.parse(l.exportSnapshot().imported_attempts[0].original),a);
});
test('manual review preserves evidence and holds; no automatic restart or replay',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.finish(j,{kind:'uncertain'},NOW);
  assert.throws(()=>l.reviewAttempt({id:'a',decision:'confirmed_not_sent',evidence:'x'},NOW),/evidence/);
  l.reviewAttempt({id:'a',decision:'keep_hold',evidence:'Owner retains the unresolved attempt'},NOW);
  assert.equal(l.status().enabled,false);assert.equal(l.status().attempts.uncertain,1);
  assert.equal(l.exportSnapshot().reviews.length,1);assert.equal(l.status().blocked_groups,1);
  l.activate();assert.equal(l.claim(NOW+HOUR,'b','2'),null);
});
test('hourly catch-up records missing hours with a bounded cursor even while stopped',()=>{
  const l=setup();assert.equal(l.reportsDue(NOW).length,0);
  assert.equal(l.reportsDue(NOW+3*HOUR).length,3);assert.equal(l.reportsDue(NOW+3*HOUR).length,0);
  const queue=l.reportQueue();assert.equal(queue.length,3);
  l.reportState(queue[0].hour,'uncertain');assert.equal(l.reportQueue().length,2);
  assert.equal(l.reportsDue(NOW+60*HOUR).length,24);
});
test('account failure stops every group while keeping attempt history',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.finish(j,{kind:'account_halt'},NOW);
  assert.equal(l.status().enabled,false);assert.equal(l.status().halt,'account_requires_review');
  assert.equal(l.status().attempts.failed,1);assert.throws(()=>l.activate(),/blocked/);
});
test('paid statistics only every fifth hour; new attempts carry immutable segment',()=>{
  const l=setup();l.activate();const j=l.claim(NOW,'a','1');l.finish(j,{kind:'sent',message_id:1},NOW);
  assert.equal(l.hourly(NOW+HOUR).paid_window,undefined);
  assert.deepEqual(l.hourly(NOW+HOUR).free,{});
  const fifth=l.hourly(NOW+5*HOUR);assert.deepEqual(fifth.paid_window.attempts,{sent:1});
  assert.deepEqual(l.hourly(NOW+5*HOUR),fifth);
});
