import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import daily from '../scripts/property_daily_cycle.cjs';
const {prepare,commitPair,pendingTarget,confirmPublication,acknowledge,assertReaderAllowed,STATE,FILES}=daily;
const bankUrl='https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates';
const time=value=>new Date(value);
const instant=time('2026-11-12T08:02:00Z');
function pair(day='2026-11-11',{effective=day,checked='08:00:01',bankChecked='08:00:02',rate=82.5486,bankRate=33.38}={}){
 const date=day.split('-').reverse();
 return {'cbr.json':{currency:'USD',rate,thbRub:2.47211,date:effective,checkedFor:day,verifiedAt:day+'T'+checked+'Z',source:'https://www.cbr.ru/scripts/XML_daily.asp?date_req='+date.join('/'),url:'https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&UniDbQuery.To='+date.join('.')},'bangkok-bank.json':{provider:'Bangkok Bank',pair:'USD/THB',type:'sight-bill-buying',rate:bankRate,sellingRate:bankRate+.4,publishedAt:effective+'T08:30:00+07:00',checkedAt:day+'T'+bankChecked+'Z',source:bankUrl,url:bankUrl}};
}
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(t,initial=pair()){
 const root=mkdtempSync(join(tmpdir(),'thaipay-cycle-test-')),remote=join(root,'remote.git'),cwd=join(root,'runner');
 t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(cwd);
 git(root,'init','--bare',remote);git(cwd,'init','--initial-branch=main');
 git(cwd,'config','user.name','Local cycle fixture');git(cwd,'config','user.email','fixture@example.test');
 git(cwd,'remote','add','origin',remote);
 const write=(values,dir=cwd)=>{mkdirSync(join(dir,'thai-payments'),{recursive:true});for(const [name,data] of Object.entries(values))writeFileSync(join(dir,'thai-payments',name),JSON.stringify(data,null,2)+'\n');};
 write(initial);writeFileSync(join(cwd,'README.md'),'Local test only\n');
 const push=(dir=cwd)=>{git(dir,'add','--all');git(dir,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','Local fixture');git(dir,'push','--atomic','origin','HEAD:refs/heads/main','HEAD:refs/heads/gh-pages');};
 push();let sequence=0;
 const clone=()=>{const dir=join(root,'runner-'+(++sequence));git(root,'clone','--branch','main',remote,dir);return dir;};
 const current=(file)=>git(root,'--git-dir',remote,'show','refs/heads/main:'+file);
 const state=()=>{try{return JSON.parse(current(STATE));}catch{return null;}};
 const refs=()=>['main','gh-pages'].map(branch=>git(root,'--git-dir',remote,'rev-parse','refs/heads/'+branch));
 const reject=()=>writeFileSync(join(remote,'hooks','pre-receive'),'#!/bin/sh\nexit 1\n',{mode:0o755});
 return {root,remote,cwd,write,push,clone,current,state,refs,reject,allow:()=>unlinkSync(join(remote,'hooks','pre-receive'))};
}
function plan(cwd,{now=instant,cron='0 11 * * *',runCreatedAt=now.toISOString(),event='schedule'}={}){return prepare({cwd,now,cron,runCreatedAt,event});}
function freeze(f,options={}){
 const now=options.now||instant,day=options.day||'2026-11-12';
 const p=plan(f.cwd,{now});f.write(pair(day,options));
 const revision=commitPair({cwd:f.cwd,plan:p,now});return {revision,plan:p,target:pendingTarget({cwd:f.cwd,now})};
}
async function confirm(f,target,{now=instant,...options}={}){
 return confirmPublication({cwd:f.cwd,target,getLatestBuild:async()=>({status:'built',commit:target.revision}),requestBuild:async()=>assert.fail('Already built: must reconcile before requesting a build'),readLivePair:async()=>structuredClone(target.values),wait:async()=>{},now:typeof now==='function'?now:()=>now,attempts:2,...options});
}
async function complete(f,target,now=instant){const proof=await confirm(f,target,{now});acknowledge({cwd:f.cwd,target,proof,now});return proof;}

test('only approved daily and catch-up scheduled events after 11:00 Moscow are eligible',()=>{
 for(const event of ['push','workflow_dispatch','workflow_run'])assert.equal(plan('/not-a-repository',{event}).mode,'skip');
 assert.equal(plan('/not-a-repository',{cron:'16 12 * * *'}).mode,'skip');
 assert.equal(plan('/not-a-repository',{now:time('2026-11-12T07:59:59.999Z')}).mode,'skip');
 assert.equal(plan('/not-a-repository',{now:time('2026-11-13T08:00:00Z'),runCreatedAt:'2026-11-12T08:00:00Z'}).mode,'skip');
 assert.throws(()=>plan('/not-a-repository',{runCreatedAt:'invalid'}),/creation time/);
 assert.throws(()=>plan('/not-a-repository',{runCreatedAt:'2026-11-13T08:00:00Z'}),/creation time/);
});
test('late catch-up accepts an unfinished same-day cycle but never runs before 11 or across Moscow midnight',t=>{
 const cron='37 11-23 * * *',late=time('2026-11-12T20:37:10Z'),f=fixture(t);
 assert.equal(plan('/not-a-repository',{cron,now:time('2026-11-12T07:59:59Z')}).mode,'skip');
 assert.equal(plan('/not-a-repository',{cron,now:time('2026-11-12T21:00:00Z'),runCreatedAt:late.toISOString()}).mode,'skip');
 const p=plan(f.cwd,{cron,now:late});assert.equal(p.mode,'refresh');
 assertReaderAllowed({cwd:f.cwd,plan:p,now:late});
 f.write(pair('2026-11-12',{checked:'20:37:01',bankChecked:'20:37:02'}));
 commitPair({cwd:f.cwd,plan:p,now:late});
 assert.equal(f.state().day,'2026-11-12');assert.equal(f.state().status,'committed');
});
test('every hourly catch-up resumes the same frozen pair and skips a completed day without reopening source readers',async t=>{
 const f=fixture(t),{target,revision}=freeze(f),cron='37 11-23 * * *';
 const slots=[...Array(13)].map((_,i)=>time('2026-11-12T'+String(i+8).padStart(2,'0')+':37:00Z'));
 const frozen=FILES.map(file=>f.current('thai-payments/'+file));
 for(const now of slots){
  const p=plan(f.cwd,{cron,now});assert.equal(p.mode,'resume');
  assert.equal(pendingTarget({cwd:f.cwd,now}).revision,revision);
  assert.throws(()=>assertReaderAllowed({cwd:f.cwd,plan:{...p,mode:'refresh'},now}),/frozen|migration/);
 }
 assert.deepEqual(FILES.map(file=>f.current('thai-payments/'+file)),frozen);
 await complete(f,target);const refs=f.refs();
 for(const now of slots){
  assert.equal(plan(f.cwd,{cron,now}).mode,'skip');
  const forged={mode:'refresh',base:refs[0],day:'2026-11-12',event:'schedule',cron,runCreatedAt:now.toISOString()};
  assert.throws(()=>assertReaderAllowed({cwd:f.cwd,plan:forged,now}),/frozen|migration/);
 }
 assert.deepEqual(f.refs(),refs);assert.deepEqual(FILES.map(file=>f.current('thai-payments/'+file)),frozen);
});
test('missing marker migrates an older valid pair and both reserves can retry an uncommitted failure',t=>{
 const f=fixture(t),before=FILES.map(file=>f.current('thai-payments/'+file));
 for(const cron of daily.CRONS){const p=plan(f.cwd,{cron});assert.equal(p.mode,'refresh');assertReaderAllowed({cwd:f.cwd,plan:p,now:instant});}
 assert.deepEqual(FILES.map(file=>f.current('thai-payments/'+file)),before);assert.equal(f.state(),null);
});
test('source failures each preserve the exact previous complete pair and do not create a lock',t=>{
 for(const badFile of FILES){
  const f=fixture(t),before=f.refs(),p=plan(f.cwd),candidate=pair('2026-11-12');
  candidate[badFile]=pair()[badFile];f.write(candidate);
  assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:instant}),/Both sources/);
  assert.deepEqual(f.refs(),before);assert.equal(f.state(),null);
 }
});
test('malformed or wrong-type verified source is never committed',t=>{
 for(const badFile of FILES){const f=fixture(t),p=plan(f.cwd),candidate=pair('2026-11-12');
  if(badFile==='cbr.json')delete candidate[badFile].thbRub;else candidate[badFile].type='TT-buying';
  f.write(candidate);assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:instant}),/Invalid verified/);assert.equal(f.state(),null);
 }
});
test('a freeze atomically binds both files and the day in equal main/gh-pages revisions',t=>{
 const f=fixture(t),{revision,target}=freeze(f);
 assert.deepEqual(f.refs(),[revision,revision]);assert.equal(f.state().status,'committed');assert.equal(f.state().day,'2026-11-12');
 assert.equal(target.revision,revision);assert.deepEqual(target.rateHashes,f.state().rateHashes);assert.deepEqual(target.values,pair('2026-11-12'));
});
test('after a frozen push, both reserves resume the same revision without a second source read',t=>{
 const f=fixture(t),{revision,plan:p}=freeze(f);
 for(const cron of daily.CRONS){assert.equal(plan(f.cwd,{cron}).mode,'resume');assert.equal(pendingTarget({cwd:f.cwd,now:instant}).revision,revision);}
 assert.throws(()=>assertReaderAllowed({cwd:f.cwd,plan:p,now:instant}),/stale|frozen/);
 assert.throws(()=>assertReaderAllowed({cwd:f.cwd,plan:null,now:instant}),/approved/);
});
test('after live acknowledgement all repeated and reserve runs skip the Moscow day',async t=>{
 const f=fixture(t),{target}=freeze(f);await complete(f,target);
 const before=f.refs();assert.equal(f.state().status,'published');
 for(const cron of daily.CRONS)assert.equal(plan(f.cwd,{cron}).mode,'skip');
 assert.deepEqual(f.refs(),before);assert.equal(pendingTarget({cwd:f.cwd,now:instant}),null);
});
test('stale clean runner fast-forwards authoritative state instead of its old checkout',async t=>{
 const f=fixture(t),stale=f.clone(),{target}=freeze(f);await complete(f,target);
 assert.equal(plan(stale).mode,'skip');assert.equal(git(stale,'rev-parse','HEAD'),f.refs()[0]);
});
test('concurrent prepared runners cannot overwrite the first frozen pair',t=>{
 const f=fixture(t),other=f.clone(),p=plan(other);const {revision}=freeze(f);
 f.write(pair('2026-11-12',{rate:90}),other);
 assert.throws(()=>commitPair({cwd:other,plan:p,now:instant}),/changed|advanced/);assert.deepEqual(f.refs(),[revision,revision]);
 assert.equal(plan(f.clone()).mode,'resume');
});
test('an unrelated concurrent commit is not rebased into a candidate rate publication',t=>{
 const f=fixture(t),p=plan(f.cwd),other=f.clone();writeFileSync(join(other,'README.md'),'Concurrent code\n');f.push(other);
 f.write(pair('2026-11-12'));assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:instant}),/changed|advanced/);assert.equal(f.state(),null);
});
test('inconsistent branches, invalid state, missing hashes and unknown schema fail closed',t=>{
 const f=fixture(t);writeFileSync(join(f.cwd,'README.md'),'Only main\n');git(f.cwd,'add','README.md');git(f.cwd,'commit','-m','Partial branch');git(f.cwd,'push','origin','HEAD:main');
 assert.throws(()=>plan(f.clone()),/branches differ/);
 for(const state of [null,false,0,[],{version:9},{version:1,status:'published'},'not-json']){
  const g=fixture(t);writeFileSync(join(g.cwd,STATE),typeof state==='string'?state:JSON.stringify(state));g.push();
  assert.throws(()=>plan(g.cwd),/Invalid|does not match/);
 }
});
test('same-day marker-free migration adopts the exact existing pair and verifies it, without rereading sources',async t=>{
 const existing=pair('2026-11-12',{checked:'00:35:00',bankChecked:'05:00:00'}),f=fixture(t,existing),before=FILES.map(file=>f.current('thai-payments/'+file));
 const p=plan(f.cwd);assert.equal(p.mode,'adopt');commitPair({cwd:f.cwd,plan:p,now:instant});
 assert.equal(f.state().origin,'adopted');assert.deepEqual(FILES.map(file=>f.current('thai-payments/'+file)),before);
 const target=pendingTarget({cwd:f.cwd,now:instant});await complete(f,target);assert.equal(plan(f.cwd).mode,'skip');
});
test('same-day partial legacy data cannot silently create another set during migration',t=>{
 const mixed=pair();mixed['cbr.json']=pair('2026-11-12')['cbr.json'];const f=fixture(t,mixed);
 assert.throws(()=>plan(f.cwd),/ambiguous partial/);assert.equal(f.state(),null);
});
test('weekend CBR keeps the real older effective date with a new Moscow check day',t=>{
 const f=fixture(t),now=time('2026-11-14T08:02:00Z'),{target}=freeze(f,{day:'2026-11-14',effective:'2026-11-13',now});
 assert.equal(target.values['cbr.json'].date,'2026-11-13');assert.equal(target.values['cbr.json'].checkedFor,'2026-11-14');
});
test('a source check before 11:00 or a Moscow date rollover cannot commit a new set',t=>{
 const f=fixture(t),p=plan(f.cwd);f.write(pair('2026-11-12',{checked:'07:59:59'}));
 assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:instant}),/scheduled daily/);
 f.write(pair('2026-11-12'));assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:time('2026-11-12T21:00:00Z')}),/eligible/);
 assert.equal(f.state(),null);
});
test('recovering a previous day consumes the completion day and both remaining reserves skip',async t=>{
 const f=fixture(t),{target}=freeze(f);
 assert.equal(plan(f.cwd,{now:time('2026-11-12T21:01:00Z'),runCreatedAt:'2026-11-12T08:00:00Z'}).mode,'skip');
 const next=time('2026-11-13T08:02:00Z');assert.equal(plan(f.cwd,{now:next}).mode,'resume');
 assert.throws(()=>pendingTarget({cwd:f.cwd,now:time('2026-11-13T07:59:59Z')}),/before/);
 const original=structuredClone(target.values),stale=f.clone();
 await complete(f,pendingTarget({cwd:f.cwd,now:next}),next);
 assert.equal(f.state().day,'2026-11-12');assert.equal(f.state().completedDay,'2026-11-13');
 assert.equal(f.state().confirmedAt,next.toISOString());
 assert.deepEqual(FILES.map(file=>JSON.parse(f.current('thai-payments/'+file))),FILES.map(file=>original[file]));
 for(const [cron,at] of [[daily.CRONS[1],'2026-11-13T08:07:00Z'],[daily.CRONS[2],'2026-11-13T08:17:00Z']]){
  for(const cwd of [f.cwd,stale,f.clone()])assert.equal(plan(cwd,{now:time(at),cron}).mode,'skip');
 }
 assert.equal(plan(f.clone(),{now:time('2026-11-14T07:59:59Z')}).mode,'skip');
 assert.equal(plan(f.clone(),{now:time('2026-11-14T08:00:00Z')}).mode,'refresh');
});
test('a later date permits just one new verified set after the previous day completed',async t=>{
 const f=fixture(t),{target}=freeze(f);await complete(f,target);
 const now=time('2026-11-13T08:02:00Z'),p=plan(f.cwd,{now});assert.equal(p.mode,'refresh');f.write(pair('2026-11-13'));
 commitPair({cwd:f.cwd,plan:p,now});assert.equal(f.state().day,'2026-11-13');assert.equal(plan(f.cwd,{now}).mode,'resume');
});
test('Pages timeout or an incomplete live read leaves the committed set pending for late success',async t=>{
 const f=fixture(t),{target,revision}=freeze(f);let posts=0;
 await assert.rejects(confirm(f,target,{getLatestBuild:async()=>({status:'building',commit:revision}),requestBuild:async()=>posts++}),/unconfirmed/);
 await assert.rejects(confirm(f,target,{readLivePair:async()=>({'cbr.json':target.values['cbr.json']})}),/unconfirmed/);
 assert.equal(posts,0);assert.equal(f.state().status,'committed');assert.equal(plan(f.clone(),{cron:daily.CRONS[1]}).mode,'resume');
 await complete(f,target);assert.equal(f.state().rateRevision,revision);assert.equal(plan(f.cwd,{cron:daily.CRONS[2]}).mode,'skip');
});
test('a mismatching bank live JSON cannot confirm a correctly built CBR source',async t=>{
 const f=fixture(t),{target}=freeze(f),wrong=structuredClone(target.values);wrong['bangkok-bank.json'].rate=99;
 await assert.rejects(confirm(f,target,{readLivePair:async()=>wrong}),/unconfirmed/);assert.equal(f.state().status,'committed');
});
test('uncertain Pages POST is observed before any further POST; late success confirms the same set',async t=>{
 const f=fixture(t),{target}=freeze(f);let build=null,posts=0;
 const proof=await confirm(f,target,{getLatestBuild:async()=>build,requestBuild:async()=>{posts++;build={status:'built',commit:target.revision};throw new Error('POST response lost');}});
 assert.equal(posts,1);acknowledge({cwd:f.cwd,target,proof,now:instant});assert.equal(f.state().status,'published');
});
test('unknown Pages state fails closed without a blind build request or success marker',async t=>{
 const f=fixture(t),{target}=freeze(f);let posts=0;
 await assert.rejects(confirm(f,target,{getLatestBuild:async()=>{throw new Error('state unavailable');},requestBuild:async()=>posts++}),/state unavailable/);
 assert.equal(posts,0);assert.equal(f.state().status,'committed');assert.throws(()=>acknowledge({cwd:f.cwd,target,proof:{},now:instant}),/verified live/);
});
test('a failed build may be requested once and is not confirmed without its live outcome',async t=>{
 const f=fixture(t),{target}=freeze(f);let posts=0;
 await assert.rejects(confirm(f,target,{getLatestBuild:async()=>({status:'errored',commit:target.revision}),requestBuild:async()=>posts++}),/unconfirmed/);
 assert.equal(posts,1);assert.equal(f.state().status,'committed');
});
test('a rejected atomic push after the local commit does not lock the authoritative day',t=>{
 const f=fixture(t),before=f.refs(),p=plan(f.cwd);f.write(pair('2026-11-12'));f.reject();
 assert.throws(()=>commitPair({cwd:f.cwd,plan:p,now:instant}));assert.deepEqual(f.refs(),before);assert.equal(f.state(),null);
 f.allow();assert.equal(plan(f.clone(),{cron:daily.CRONS[1]}).mode,'refresh');
});
test('a failed acknowledgement push never makes a frozen set eligible for another source read',async t=>{
 const f=fixture(t),{target}=freeze(f),proof=await confirm(f,target);f.reject();
 assert.throws(()=>acknowledge({cwd:f.cwd,target,proof,now:instant}));assert.equal(f.state().status,'committed');f.allow();
 const next=f.clone();assert.equal(plan(next,{cron:daily.CRONS[1]}).mode,'resume');
 const nextTarget=pendingTarget({cwd:next,now:instant});const nextProof=await confirm({...f,cwd:next},nextTarget);
 acknowledge({cwd:next,target:nextTarget,proof:nextProof,now:instant});assert.equal(plan(f.clone(),{cron:daily.CRONS[2]}).mode,'skip');
});
test('publication of a descendant code revision only confirms the identical frozen pair',async t=>{
 const f=fixture(t),{target}=freeze(f);writeFileSync(join(f.cwd,'README.md'),'A later unrelated code change\n');f.push();
 const updated=pendingTarget({cwd:f.cwd,now:instant}),revision=f.refs()[0];
 const proof=await confirm(f,updated,{getLatestBuild:async()=>({status:'built',commit:revision})});
 acknowledge({cwd:f.cwd,target:updated,proof,now:instant});assert.equal(f.state().rateRevision,target.revision);assert.equal(f.state().publishedRevision,revision);
});
test('tampered or newer file bytes cannot reuse a frozen day marker',t=>{
 const f=fixture(t);freeze(f);const wrong=pair('2026-11-12',{rate:99});f.write(wrong);f.push();
 assert.throws(()=>plan(f.cwd),/does not match/);
});
test('clock rollover during final Git work prevents a push even after successful source verification',t=>{
 const f=fixture(t),p=plan(f.cwd),before=f.refs();f.write(pair('2026-11-12'));let calls=0;
 const clock=()=>++calls<3?instant:time('2026-11-12T21:00:00Z');
 assert.throws(()=>commitPair({cwd:f.cwd,plan:p,clock}),/eligible/);assert.deepEqual(f.refs(),before);assert.equal(f.state(),null);
});
test('clock rollover during a Pages observation cannot initiate a build before 11 or confirm a new day',async t=>{
 const f=fixture(t),{target}=freeze(f);let clock=instant,posts=0;
 await assert.rejects(confirm(f,target,{now:()=>clock,getLatestBuild:async()=>{clock=time('2026-11-12T21:00:00Z');return null;},requestBuild:async()=>posts++}),/Moscow date|before 11/);
 assert.equal(posts,0);assert.equal(f.state().status,'committed');
});
test('a lost job result after an accepted push is recovered from Git, not by obtaining another course',t=>{
 const f=fixture(t);let revision;
 assert.throws(()=>{revision=freeze(f).revision;throw new Error('Job lost its final response');},/lost its final response/);
 const next=f.clone();assert.equal(plan(next,{cron:daily.CRONS[1]}).mode,'resume');assert.equal(pendingTarget({cwd:next,now:instant}).revision,revision);
});
test('a forged completed marker cannot suppress a real source failure',async t=>{
 const f=fixture(t),{target}=freeze(f);await complete(f,target);
 const state=f.state();state.confirmedAt='2026-11-12T07:00:00Z';writeFileSync(join(f.cwd,STATE),JSON.stringify(state));f.push();
 assert.throws(()=>plan(f.clone()),/confirmation/);
});
test('completion day blocks even a forged refresh plan at the source and commit boundaries',async t=>{
 const f=fixture(t);freeze(f);const now=time('2026-11-13T08:02:00Z');await complete(f,pendingTarget({cwd:f.cwd,now}),now);
 const forced={mode:'refresh',base:f.refs()[0],day:'2026-11-13',event:'schedule',cron:daily.CRONS[1],runCreatedAt:now.toISOString()};
 assert.throws(()=>assertReaderAllowed({cwd:f.cwd,plan:forced,now}),/frozen|migration/);
 const before=f.refs();f.write(pair('2026-11-13'));assert.throws(()=>commitPair({cwd:f.cwd,plan:forced,now}),/day is complete/);assert.deepEqual(f.refs(),before);
});
test('a rejected recovery acknowledgement stays resumable and cannot allow a second rate that day',async t=>{
 const f=fixture(t);const {revision}=freeze(f);const now=time('2026-11-13T08:02:00Z'),target=pendingTarget({cwd:f.cwd,now}),proof=await confirm(f,target,{now});
 f.reject();assert.throws(()=>acknowledge({cwd:f.cwd,target,proof,now}));assert.equal(f.state().status,'committed');assert.equal(f.state().completedDay,undefined);f.allow();
 const next=f.clone(),reserve=time('2026-11-13T08:07:00Z');assert.equal(plan(next,{now:reserve,cron:daily.CRONS[1]}).mode,'resume');
 const nextTarget=pendingTarget({cwd:next,now:reserve});assert.equal(nextTarget.revision,revision);
 await complete({...f,cwd:next},nextTarget,reserve);
 assert.equal(f.state().day,'2026-11-12');assert.equal(f.state().completedDay,'2026-11-13');
 assert.equal(plan(f.clone(),{now:time('2026-11-13T08:17:00Z'),cron:daily.CRONS[2]}).mode,'skip');
});
test('a lost response after an accepted recovery acknowledgement remains complete in fresh clones',async t=>{
 const f=fixture(t);freeze(f);const now=time('2026-11-13T08:02:00Z'),target=pendingTarget({cwd:f.cwd,now}),proof=await confirm(f,target,{now});
 assert.throws(()=>{acknowledge({cwd:f.cwd,target,proof,now});throw new Error('Acknowledgement response lost');},/response lost/);
 assert.equal(f.state().completedDay,'2026-11-13');assert.equal(f.state().day,'2026-11-12');
 for(const cron of daily.CRONS.slice(1))assert.equal(plan(f.clone(),{now,cron}).mode,'skip');
});
test('legacy published markers derive their completion-day lock from real confirmedAt',async t=>{
 const f=fixture(t);freeze(f);const now=time('2026-11-13T08:02:00Z');await complete(f,pendingTarget({cwd:f.cwd,now}),now);
 const old=f.state();delete old.completedDay;writeFileSync(join(f.cwd,STATE),JSON.stringify(old));f.push();
 for(const cron of daily.CRONS.slice(1))assert.equal(plan(f.clone(),{now,cron}).mode,'skip');
 assert.equal(plan(f.clone(),{now:time('2026-11-14T08:02:00Z')}).mode,'refresh');
});
test('inconsistent, invalid or future completion dates fail closed rather than reopening a day',async t=>{
 const f=fixture(t),{target}=freeze(f);await complete(f,target);const valid=f.state();
 for(const completedDay of ['2026-11-11','2026-11-13','invalid',null,42]){
  writeFileSync(join(f.cwd,STATE),JSON.stringify({...valid,completedDay}));f.push();
  assert.throws(()=>plan(f.clone()),/completion date/);
 }
 for(const confirmedAt of ['2026-11-13T08:02:00Z','2026-11-12T08:02:00.001Z']){
  writeFileSync(join(f.cwd,STATE),JSON.stringify({...valid,confirmedAt,completedDay:daily.localTime(confirmedAt).day}));f.push();
  assert.throws(()=>plan(f.clone()),/confirmation/);
 }
});
test('a pending marker cannot claim a completion day before live confirmation',t=>{
 const f=fixture(t);freeze(f);writeFileSync(join(f.cwd,STATE),JSON.stringify({...f.state(),completedDay:'2026-11-12'}));f.push();
 assert.throws(()=>plan(f.clone()),/completion metadata/);
});
test('deleting a prior completion marker is not treated as a first migration',async t=>{
 const f=fixture(t);freeze(f);const now=time('2026-11-13T08:02:00Z');await complete(f,pendingTarget({cwd:f.cwd,now}),now);
 unlinkSync(join(f.cwd,STATE));f.push();assert.throws(()=>plan(f.clone(),{now}),/state disappeared/);
});
