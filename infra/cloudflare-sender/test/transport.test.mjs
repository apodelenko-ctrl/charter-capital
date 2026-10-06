import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('workerd: MTProto crypto, photo serialization, rights and uncertain outcomes',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/transport/transport-probe.js',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],outboundService:()=>new Response('No network',{status:403})}));
  try {
    const response=await mf.dispatchFetch('http://fixture.local');assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.cryptoRoundtrip,true);assert.ok(result.serializedPhotoRequestBytes>0);
    assert.equal(result.allowed,null);assert.equal(result.photoDenied,'write_restricted');
    assert.equal(result.unknown,null);assert.equal(result.found,'42');assert.equal(result.ambiguous,'uncertain');
    assert.equal(result.connections,0);assert.equal(result.sends,0);
    console.log('Offline transport evidence:',JSON.stringify(result));
  } finally {await mf.dispose();}
});
