// Run the production OFF build in local workerd with all outbound I/O blocked.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2];if(!input)throw Error('private_snapshot_path_required');
const body=fs.readFileSync(input,'utf8'),snapshot=JSON.parse(body);let outbound=0;
buildSync({entryPoints:[root+'test/rehearsal-gateway.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:*'],outfile:root+'build/rehearsal.mjs'});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/rehearsal.mjs',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],
  durableObjects:{SENDER:{className:'Sender',useSQLite:true}},outboundService:()=>{outbound++;return new Response('Blocked',{status:403});}}));
try{
  const response=await mf.dispatchFetch('http://fixture.local/import',{method:'POST',body});assert.equal(response.status,200);
  const status=await response.json();assert.equal(status.enabled,false);
  const current=await (await mf.dispatchFetch('http://fixture.local/status')).json();assert.equal(current.live_release,false);
  assert.equal((await mf.dispatchFetch('http://fixture.local/activate',{method:'POST'})).status,409);
  assert.equal((await (await mf.dispatchFetch('http://fixture.local/tick')).json()).status,'offline_build');
  const exported=await (await mf.dispatchFetch('http://fixture.local/export')).json();
  assert.equal(exported.attempts.length,snapshot.attempts.length);assert.equal(exported.archive.length,snapshot.archive.length);
  assert.deepEqual(exported.paid_variants,snapshot.paid_variants);
  fs.writeFileSync(path.join(path.dirname(input),'workerd-export.json'),JSON.stringify(exported),{mode:0o600});
  assert.equal(outbound,0);
  console.log(JSON.stringify({workerd_import_export:true,compiled_fuse_verified:true,bytes:Buffer.byteLength(body),attempts:exported.attempts.length,
    variants:exported.paid_variants.length,visibility:exported.visibility.length,archive_files:exported.archive.length,outbound_calls:outbound,enabled:false}));
}finally{await mf.dispose();}
