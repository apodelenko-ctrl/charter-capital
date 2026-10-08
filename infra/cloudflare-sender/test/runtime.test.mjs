import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildSync} from 'esbuild';
import {snapshot,group} from './fixtures.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
buildSync({entryPoints:[root+'test/gateway.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:*'],outfile:root+'build/test-gateway.mjs'});
async function fixture(handler) {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/test-gateway.mjs',compatibilityDate:'2026-10-06',
    compatibilityFlags:['nodejs_compat'],durableObjects:{SENDER:{className:'Sender',useSQLite:true}},serviceBindings:{FAKE:handler}}));
  const call=async(path,data)=>{
    const r=await mf.dispatchFetch('http://fixture.local/'+path,{method:data?'POST':'GET',...(data?{body:JSON.stringify(data)}:{})});
    assert.equal(r.status,200);return r.json();
  };
  await call('import',snapshot({groups:[group({valid_until:Date.now()+86400000,paid_until:Date.now()+86400000})]}));
  await call('activate');return {mf,call};
}
test('actual DO SQLite: repeat tick sends once, preserves outcome',async()=>{
  let sends=0;
  const {mf,call}=await fixture(async req=>Response.json(req.url.endsWith('/prepare')?{kind:'ready'}:req.url.endsWith('/verify')?{kind:'verified'}:{kind:'sent',message_id:++sends}));
  try {await call('tick');await call('tick');assert.equal(sends,1);assert.equal((await call('status')).attempts.sent,1);}
  finally {await mf.dispose();}
});
test('actual DO interleaving: stop while preparing prevents delivery',async()=>{
  let release,entered;const gate=new Promise(r=>{release=r});const ready=new Promise(r=>{entered=r});let sends=0;
  const {mf,call}=await fixture(async req=>{
    if(req.url.endsWith('/prepare')){entered();await gate;return Response.json({kind:'ready'});}
    sends++;return Response.json({kind:'sent',message_id:1});
  });
  try {const tick=call('tick');await ready;await call('stop');release();await tick;
    assert.equal(sends,0);assert.equal((await call('status')).enabled,false);assert.equal((await call('status')).attempts.cancelled,1);}
  finally {release();await mf.dispose();}
});
test('actual DO read report during pending preparation preserves sender state and does not send',async()=>{
  let release,entered,sends=0;
  const gate=new Promise(r=>{release=r}),ready=new Promise(r=>{entered=r});
  const {mf,call}=await fixture(async req=>{
    if(req.url.endsWith('/prepare')){entered();await gate;return Response.json({kind:'preflight_failed'});}
    sends++;return Response.json({kind:'sent',message_id:1});
  });
  try{
    const tick=call('tick');await ready;const before=await call('status'),now=Date.now();
    const report=await call('query-report',{scope:'free',start_utc:new Date(now-3600000).toISOString(),end_utc:new Date(now).toISOString()});
    assert.equal(report.ok,true);assert.equal(report.report.shared_account_state.unresolved.pending,1);
    assert.deepEqual(await call('status'),before);assert.equal(sends,0);
    const bad=await call('query-report',{scope:'all'});assert.equal(bad.ok,false);assert.equal(bad.status,400);
    release();await tick;assert.equal(sends,0);
  }finally{release();await mf.dispose();}
});
test('actual DO: uncertain response halts and retry does not send again',async()=>{
  let sends=0;
  const {mf,call}=await fixture(async req=>{
    if(req.url.endsWith('/prepare'))return Response.json({kind:'ready'});
    sends++;return Response.json({kind:'uncertain'});
  });
  try {await call('tick');await call('tick');assert.equal(sends,1);assert.equal((await call('status')).attempts.uncertain,1);}
  finally {await mf.dispose();}
});
test('production entry exposes health only; no public start/import endpoint',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/worker.js',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],durableObjects:{SENDER:{className:'Sender',useSQLite:true}}}));
  try {
    assert.equal((await(await mf.dispatchFetch('http://fixture.local/health')).json()).live_release,false);
    for(const path of ['activate','admin/import','admin/active','telegram']) assert.equal((await mf.dispatchFetch('http://fixture.local/'+path,{method:'POST'})).status,404);
    assert.equal((await mf.dispatchFetch('http://fixture.local/admin/sender/report')).status,404);
  } finally {await mf.dispose();}
});
