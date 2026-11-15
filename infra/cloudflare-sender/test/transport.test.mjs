import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {IGE} from 'teleproto/crypto/IGE.js';
import {FullPacketCodec} from 'teleproto/network/connection/TCPFull.js';
const root=fileURLToPath(new URL('../',import.meta.url));
test('workerd: MTProto crypto, photo serialization, rights and uncertain outcomes',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:root+'build/transport/transport-probe.js',compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],outboundService:()=>new Response('No network',{status:403})}));
  try {
    const response=await mf.dispatchFetch('http://fixture.local');assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.cryptoRoundtrip,true);assert.ok(result.serializedPhotoRequestBytes>0);assert.ok(result.serializedUploadBytes>512*1024);
    const encrypted=new IGE(Buffer.alloc(32,7),Buffer.alloc(32,9)).encryptIge(Buffer.alloc(512*1024,3));
    assert.equal(result.wireHash,createHash('sha256').update(new FullPacketCodec({}).encodePacket(encrypted)).digest('hex'));
    assert.equal(result.allowed,null);assert.equal(result.photoDenied,'write_restricted');
    assert.equal(result.unknown,null);assert.equal(result.found,'42');assert.equal(result.ambiguous,'uncertain');
    assert.equal(result.connections,0);assert.equal(result.sends,0);
    console.log('Offline transport evidence:',JSON.stringify(result));
  } finally {await mf.dispose();}
});
