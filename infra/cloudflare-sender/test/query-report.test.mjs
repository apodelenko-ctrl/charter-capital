import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeLedger} from './helpers.mjs';
import {NOW,group,snapshot} from './fixtures.mjs';
import {HOUR} from '../src/ledger.mjs';
import {queryReport as queryReportWithScope} from '../src/query-report.mjs';
const ORIGINAL_PAID_IDS=Object.freeze(Array.from({length:8},(_,i)=>-100100001-i));
const queryReport=(ledger,input,now)=>queryReportWithScope(ledger,input,now,ORIGINAL_PAID_IDS);
import {validateReportQuery,reportQueryFromUrl,MAX_REPORT_RECORDS} from '../src/report-query-input.mjs';

const freeId=-10011111,paidId=ORIGINAL_PAID_IDS[0],ninthId=-100100009;
const input=(scope='free',hours=1)=>({scope,start_utc:new Date(NOW-hours*HOUR).toISOString(),end_utc:new Date(NOW).toISOString()});
const attempt=(id,overrides={})=>({id:String(id),chat_id:freeId,created:NOW-1,status:'sent',digest:'test',segment:'free',message_id:String(Number(id)+100),...overrides});
function setup({attempts=[],groups=[group({chat_id:freeId,paid:false})],registry={},...rest}={}){
  const body=JSON.stringify(registry);
  return makeLedger(snapshot({attempts,groups,source:{discovery_enabled:false,exported_at:NOW-HOUR},
    archive:[{path:'group-registry.json',body,sha256:createHash('sha256').update(body).digest('hex')}],...rest}));
}
function allTables(db){
  return JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    .map(({name})=>[name,db.prepare('SELECT * FROM '+name).all()]));
}

test('full window contains more than 100 records, exact half-open boundaries, no unknown-to-free inference',()=>{
  const attempts=Array.from({length:150},(_,i)=>attempt(i,{created:NOW-HOUR+i*1000}));
  attempts.push(attempt(151,{created:NOW}),attempt(152,{created:NOW-HOUR-1}),attempt(153,{segment:'unknown'}),attempt(154,{segment:'paid'}));
  const {ledger}=setup({attempts});
  const report=queryReport(ledger,input(),NOW);
  assert.equal(report.records.length,150);assert.equal(report.summary.submitted_attempts,150);
  assert.equal(report.summary.known_publications,150);assert.equal(report.summary.verified_publications,0);
  assert.equal(report.summary.visibility.not_recorded,150);assert.equal(report.summary.publication_formats.unknown,150);
  assert.equal(report.coverage.account_window_records_by_stored_segment.unknown,1);
  assert.equal(report.coverage.selected_unknown_segment_records,0);assert.equal(report.coverage.truncated,false);
  assert.equal(report.records[0].id,'0');assert.equal(report.records.at(-1).id,'149');
});

test('paid report uses original eight IDs over five hours, including unknown rows explicitly, excluding ninth',()=>{
  const attempts=ORIGINAL_PAID_IDS.map((id,i)=>attempt(i,{chat_id:id,created:NOW-5*HOUR+i,segment:i?'paid':'unknown'}));
  attempts.push(attempt(9,{chat_id:ninthId,segment:'paid'}),attempt(10));
  const {ledger}=setup({attempts,groups:ORIGINAL_PAID_IDS.map(chat_id=>group({chat_id}))});
  const report=queryReport(ledger,input('paid',5),NOW);
  assert.equal(report.records.length,8);assert.equal(report.groups.length,8);
  assert.equal(report.coverage.selected_unknown_segment_records,1);
  assert.equal(report.scope_definition,'original_eight_chat_ids_regardless_of_stored_segment');
  assert.deepEqual(report.paid_chat_ids,ORIGINAL_PAID_IDS);assert.ok(report.records.every(r=>r.chat_id!==ninthId));
});

test('publication format and visibility come from delivery evidence, separate acknowledgements, external and verified',()=>{
  const attempts=[attempt(1),attempt(2,{status:'sent_external'}),attempt(3),attempt(4,{status:'failed',error:'FloodWaitError: 600 secret'})];
  const visibility=[{attempt_id:'1',chat_id:freeId,message_id:'101',spec:{text:'PRIVATE_CAPTION',format:'text',handle:'old_username'},state:'verified',checked_at:NOW},
    {attempt_id:'2',chat_id:freeId,message_id:'102',spec:{text:'PRIVATE_CAPTION',format:'photo',handle:'old_username'},state:'quarantined',checked_at:NOW,reason:'visibility_mismatch'}];
  const {ledger}=setup({attempts,visibility});
  const r=queryReport(ledger,input(),NOW);
  assert.equal(r.summary.api_acknowledged,2);assert.equal(r.summary.externally_confirmed,1);
  assert.equal(r.summary.known_publications,3);assert.equal(r.summary.verified_publications,1);
  assert.deepEqual(r.summary.publication_formats,{photo:1,text:1,unknown:1});
  assert.equal(r.records[0].recorded_format,'text');assert.equal(r.records[0].public_link,'https://t.me/old_username/101');
  assert.equal(r.records[0].member_link,'https://t.me/c/11111/101');
  assert.equal(r.records[3].public_link,null);assert.deepEqual(r.summary.submitted_errors,{FloodWaitError:1});
  assert.ok(!JSON.stringify(r).includes('PRIVATE_CAPTION'));assert.ok(!JSON.stringify(r).includes('600 secret'));
});

test('registry, membership, admission and shared account restrictions have distinct scope and time basis',()=>{
  const registry={
    [freeId]:{membership:'joined',left:false,members:1000000},
    [paidId]:{membership:'approval_pending',left:true},
    [-100555]:{membership:'not_confirmed_joined',left:true},
  };
  const {ledger}=setup({registry,groups:[group({chat_id:freeId,paid:false,enabled:false}),group({chat_id:paidId})],
    wait_until:NOW+HOUR,attempts:[attempt(1,{chat_id:paidId,segment:'paid',status:'uncertain'})],
    blocked:[{chat_id:paidId,reason:'account-private-content-must-not-leak'}]});
  const r=queryReport(ledger,input(),NOW);
  assert.equal(r.registry.account_base.registry_entries,3);assert.equal(r.registry.account_base.joined,1);
  assert.equal(r.registry.scope_base.registry_entries,1);assert.equal(r.registry.scope_base.joined,1);
  assert.equal(r.admissions.with_current_rule,1);assert.equal(r.admissions.policy_approved,0);
  assert.deepEqual(r.groups[0].current_admission.local_holds,['disabled']);
  assert.equal(r.shared_account_state.flood_wait_active,true);assert.equal(r.shared_account_state.unresolved.uncertain,1);
  assert.equal(r.summary.status.uncertain,0);assert.equal(r.registry.as_of_utc,new Date(NOW-HOUR).toISOString());
  assert.equal(r.coverage.membership_basis,'imported_registry_snapshot_not_live_telegram');
  assert.ok(!JSON.stringify(r).includes('1000000'));assert.ok(!JSON.stringify(r).includes('account-private-content'));
});

test('read query does not recover pending, change history/control/alarm/report queue, or write SQL',()=>{
  const {ledger,db}=setup({attempts:[attempt(1,{status:'pending'}),attempt(2,{status:'failed',error:'last_message_ours'})]});
  ledger.sql.exec("UPDATE attempts SET submitted=0 WHERE id='2'");
  ledger.sql.exec('UPDATE control SET enabled=1 WHERE id=1'); // Synthetic in-flight fixture.
  const before=allTables(db),exec=ledger.sql.exec;
  ledger.sql.exec=(q,...args)=>{assert.match(q,/^SELECT /);return exec(q,...args);};
  const r=queryReport(ledger,input(),NOW);
  assert.equal(r.summary.submitted_attempts,1);assert.equal(r.summary.pre_submission_checks,1);
  assert.equal(r.summary.pre_submission_skips,1);assert.deepEqual(r.summary.check_errors,{last_message_ours:1});
  assert.equal(r.shared_account_state.enabled,true);assert.equal(r.summary.status.pending,1);
  assert.equal(allTables(db),before);
});

test('strict UTC inputs reject offsets, impossible dates, duplicates, unknown params, reversed/future/oversize windows',()=>{
  const good=input();assert.equal(validateReportQuery(good,NOW).start,NOW-HOUR);
  for(const bad of [
    {...good,scope:'all'},{...good,start_utc:'2026-02-30T00:00:00Z'},
    {...good,start_utc:'2026-10-06T08:00:00+00:00'},{...good,start_utc:'2026-10-06'},
    {...good,start_utc:good.end_utc},{...good,end_utc:new Date(NOW+1).toISOString()},
    {...good,limit:100},input('free',25),
  ])assert.throws(()=>validateReportQuery(bad,NOW));
  assert.throws(()=>reportQueryFromUrl('https://fixture/?'+new URLSearchParams(good)+'&scope=paid',NOW),/duplicate/);
});

test('no silent truncation: oversize record count rejected before reading records',()=>{
  const ledger={control:()=>({initialized:1}),rows:()=>[{n:MAX_REPORT_RECORDS+1}]};
  assert.throws(()=>queryReport(ledger,input(),NOW),e=>e.status===413 && /split_window/.test(e.code));
});

test('zero activity still lists eight paid groups; uninitialized ledger does not report a false zero',()=>{
  const {ledger}=setup();const r=queryReport(ledger,input('paid',5),NOW);
  assert.equal(r.records.length,0);assert.equal(r.groups.length,8);assert.equal(r.summary.known_publications,0);
  assert.equal(r.admissions.with_current_rule,0);
  assert.throws(()=>queryReport({control:()=>({initialized:0})},input(),NOW),e=>e.code==='ledger_not_initialized');
});

test('paid scope must be a privately configured fixed set of eight; public build fails closed',()=>{
  const {ledger}=setup();
  assert.throws(()=>queryReportWithScope(ledger,input('paid'),NOW),e=>e.code==='paid_scope_not_configured' && e.status===503);
  for(const ids of [[],[...ORIGINAL_PAID_IDS,ninthId],ORIGINAL_PAID_IDS.map(()=>paidId),ORIGINAL_PAID_IDS.map(()=>1)]){
    assert.throws(()=>queryReportWithScope(ledger,input('paid'),NOW,ids),e=>e.code==='paid_scope_not_configured');
  }
  assert.equal(queryReportWithScope(ledger,input('free'),NOW).summary.ledger_records,0);
});
