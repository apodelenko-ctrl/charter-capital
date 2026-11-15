// Run only against a local review copy prepared by prepare_desk.py.
// Actual desk code, fake owner/admin strings, no outbound network.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildSync} from 'esbuild';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const review=resolve(process.argv[2] || 'missing-review-directory');
let fakeSends=0,failSend=false;
buildSync({entryPoints:[review+'/worker.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:*'],outfile:review+'/adapter-test.mjs'});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'desk',rootPath:review,modules:true,scriptPath:review+'/adapter-test.mjs',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],
    durableObjects:{DESK:{className:'DeskObject',useSQLite:true}},bindings:{ADMIN_SECRET:'synthetic-admin-only',BOT_TOKEN:'fixture-only',WEBHOOK_SECRET:'synthetic-webhook-only'},
    serviceBindings:{SENDER_CONTROL:{name:'control',entrypoint:'SenderControl'}},outboundService:async req=>{
      if(req.url.endsWith('/getMe'))return Response.json({ok:true,result:{id:99}});
      assert.ok(req.url.endsWith('/sendMessage'));const payload=await req.json();assert.equal(payload.chat_id,123);fakeSends++;
      return Response.json(failSend?{ok:false,error_code:500}:{ok:true,result:{message_id:42}});
    }},
  {name:'control',modules:true,compatibilityDate:'2026-10-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';
    let stops=0;
    export class SenderControl extends WorkerEntrypoint {
      status(){return {fixture:true,stops};}stop(){stops++;return {enabled:false};}
      queryReport(input){return input.scope==='paid'?{ok:false,error:'too_many_records_split_window',status:413}:{ok:true,report:{fixture:true,...input}};}
    }
    export default {fetch(){return new Response('fixture');}};`},
  {name:'caller',modules:true,compatibilityDate:'2026-10-06',serviceBindings:{REPORTS:{name:'desk',entrypoint:'SenderReports'}},
    script:`export default{async fetch(request,env){return Response.json(await env.REPORTS.accept(await request.json()));}};`},
]}));
try{
  const unauthorized=await mf.dispatchFetch('https://fixture.local/admin/sender/status');assert.equal(unauthorized.status,403);
  const headers={Authorization:'Bearer synthetic-admin-only','Content-Type':'application/json'};
  const status=await mf.dispatchFetch('https://fixture.local/admin/sender/status',{headers});assert.deepEqual(await status.json(),{fixture:true,stops:0});
  const snapshot={config:{owner_id:123,business_owner_id:124,bot_id:99,allow_new_business_chats:false,test_chat_ids:[125]},tables:{leads:[],connections:[],updates:[],messages:[],meta:[],outbox:[]}};
  const imported=await mf.dispatchFetch('https://fixture.local/admin/import',{method:'POST',headers,body:JSON.stringify(snapshot)});assert.equal(imported.status,200);
  const query={scope:'free',start_utc:'2026-10-06T00:00:00Z',end_utc:'2026-10-06T01:00:00Z'};
  const reportUrl='https://fixture.local/admin/sender/report?'+new URLSearchParams(query);
  const deskBefore=await(await mf.dispatchFetch('https://fixture.local/admin/export',{headers})).json();
  assert.equal((await mf.dispatchFetch(reportUrl)).status,403);
  assert.equal((await mf.dispatchFetch(reportUrl,{headers:{Authorization:'Bearer wrong'}})).status,403);
  assert.equal((await mf.dispatchFetch(reportUrl,{method:'POST',headers})).status,405);
  assert.equal((await mf.dispatchFetch(reportUrl+'&scope=paid',{headers})).status,400);
  assert.equal((await mf.dispatchFetch(reportUrl+'&limit=100',{headers})).status,400);
  assert.equal((await mf.dispatchFetch(reportUrl.replace('scope=free','scope=paid'),{headers})).status,413);
  const windowResponse=await mf.dispatchFetch(reportUrl,{headers});
  assert.equal(windowResponse.status,200);assert.equal(windowResponse.headers.get('Cache-Control'),'private, no-store');
  assert.equal(windowResponse.headers.get('Vary'),'Authorization');assert.deepEqual(await windowResponse.json(),{fixture:true,...query});
  assert.deepEqual(await(await mf.dispatchFetch('https://fixture.local/admin/export',{headers})).json(),deskBefore);
  assert.equal(fakeSends,0);
  const end=Math.floor(Date.now()/3600000)*3600000;
  const report={start:end-3600000,end,generated_at:end,attempts:{sent:3},unresolved_now:{uncertain:3},groups:[],enabled:false};
  const caller=await mf.getWorker('caller');
  for(let i=0;i<2;i++){
    const receipt=await caller.fetch('https://fixture.local',{method:'POST',body:JSON.stringify(report)});assert.equal((await receipt.json()).state,'blocked');
  }
  const exported=await(await mf.dispatchFetch('https://fixture.local/admin/export',{headers})).json();
  assert.equal(exported.outbox.length,1);assert.equal(exported.outbox[0].payload.chat_id,123);
  assert.equal(exported.active,false);assert.equal(exported.outbox[0].state,'pending');
  const active=await mf.dispatchFetch('https://fixture.local/admin/active',{method:'POST',headers,body:JSON.stringify({active:true})});assert.equal(active.status,200);
  async function waitState(expected) {
    for(let i=0;i<80;i++){
      const s=await(await mf.dispatchFetch('https://fixture.local/admin/export',{headers})).json();
      if(s.outbox.at(-1)?.state===expected)return;
      await new Promise(r=>setTimeout(r,50));
    }
    assert.fail('mock report did not reach '+expected);
  }
  await waitState('sent');
  let receipt=await caller.fetch('https://fixture.local',{method:'POST',body:JSON.stringify(report)});
  assert.equal((await receipt.json()).state,'sent');assert.equal(fakeSends,1);
  failSend=true;
  const next={...report,start:end,end:end+3600000};
  await caller.fetch('https://fixture.local',{method:'POST',body:JSON.stringify(next)});await waitState('uncertain');
  receipt=await caller.fetch('https://fixture.local',{method:'POST',body:JSON.stringify(next)});
  assert.equal((await receipt.json()).state,'uncertain');assert.equal(fakeSends,2);
  failSend=false;
  const update=(id,from=123,chat=123,text='/pause_ads')=>({update_id:id,message:{from:{id:from},chat:{id:chat,type:'private'},text}});
  const webhook=(u,authenticated=true)=>mf.dispatchFetch('https://fixture.local/telegram',{method:'POST',
    headers:{'Content-Type':'application/json',...(authenticated?{'X-Telegram-Bot-Api-Secret-Token':'synthetic-webhook-only'}:{})},body:JSON.stringify(u)});
  assert.equal((await webhook(update(100),false)).status,403);
  assert.equal((await webhook(update(101,124))).status,200);
  assert.equal((await webhook(update(102,123,125))).status,200);
  assert.equal((await(await mf.dispatchFetch('https://fixture.local/admin/sender/status',{headers})).json()).stops,0);
  assert.equal((await webhook(update(103))).status,200);
  assert.equal((await webhook(update(103))).status,200);
  assert.equal((await(await mf.dispatchFetch('https://fixture.local/admin/sender/status',{headers})).json()).stops,1);
  await waitState('sent');
  assert.equal((await webhook(update(104,123,123,'/groups'))).status,200);await waitState('sent');
  const after=await(await mf.dispatchFetch('https://fixture.local/admin/export',{headers})).json();
  const commands=after.outbox.filter(x=>x.dedupe.startsWith('charter-sender-command:'));
  assert.equal(commands.length,2);assert.ok(commands.every(x=>x.state==='sent'));
  assert.equal(fakeSends,4);
  console.log(JSON.stringify({desk_auth_preserved:true,private_rpc:true,report_deduplication:true,existing_owner_only:true,
    uncertain_report_not_retried:true,owner_stop_command_deduplicated:true,foreign_stop_rejected:true,
    window_report_auth_preserved:true,window_query_changes_no_state:true,window_query_notifies_nobody:true,mocked_bot_sends:4,external_network_calls:0}));
}finally{await mf.dispose();}
