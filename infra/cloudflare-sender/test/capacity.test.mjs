import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
buildSync({entryPoints:[root+'test/capacity-gateway.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:*'],outfile:root+'build/capacity.mjs'});
test('actual workerd SQLite metering for second synthetic day',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/capacity.mjs',compatibilityDate:'2026-10-06',
    durableObjects:{PROBE:{className:'Probe',useSQLite:true}},outboundService:()=>new Response('Blocked',{status:403})}));
  try{
    const r=await mf.dispatchFetch('http://fixture.local');assert.equal(r.status,200);
    const meter=await r.json();assert.ok(meter.second_day_attempts>4500);assert.equal(meter.sends,0);
    // These guard the current schedule only; account usage and remote CPU are separate gates.
    assert.ok(meter.total_write_estimate<100000,JSON.stringify(meter));
    assert.ok(meter.sql_rows_read<5000000,JSON.stringify(meter));
    console.log('Synthetic SQLite capacity:',JSON.stringify(meter));
  }finally{await mf.dispose();}
});
