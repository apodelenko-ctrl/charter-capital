import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
buildSync({entryPoints:[root+'test/capacity-gateway.mjs'],bundle:true,format:'esm',platform:'node',external:['cloudflare:*'],outfile:root+'build/capacity.mjs'});
test('workerd meters current A/B + visibility load and reports the Free-plan deployment gate',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/capacity.mjs',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],
    durableObjects:{PROBE:{className:'Probe',useSQLite:true}},outboundService:()=>new Response('Blocked',{status:403})}));
  try{
    const results=[];
    for(const mode of ['upper','current']){
      const r=await mf.dispatchFetch('http://fixture.local/'+mode);assert.equal(r.status,200);
      const meter=await r.json();assert.ok(meter.second_day_attempts>(mode==='upper'?8500:6500));assert.equal(meter.sends,0);
      assert.ok(meter.total_write_estimate>=meter.sql_rows_written+4*meter.second_day_attempts);
      const result={...meter,free_sql_fits:meter.total_write_estimate<100000 && meter.sql_rows_read<5000000};
      results.push(result);console.log('Capacity:',JSON.stringify(result));
    }
    // The test passes when measurement works. free_sql_fits=false remains an
    // explicit launch blocker; this is never a claim that Free is sufficient.
    fs.writeFileSync(root+'build/capacity-result.json',JSON.stringify(results,null,2)+'\n');
  }finally{await mf.dispose();}
});
