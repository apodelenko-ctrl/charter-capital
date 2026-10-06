import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {StringSession} from 'teleproto/sessions/index.js';
import {TelegramTransport,ONE_CALL,classify} from '../src/telegram-core.mjs';
import {group,NOW} from './fixtures.mjs';

// Minimal JPEG header fixture; no production photo or Telegram credential.
const jpg=Buffer.from('ffd8ffc00011080010001003011100021100031100ffd9','hex');
function setup(change=()=>{},errorAt=null) {
  const calls=[];let connections=0,destroyed=0;
  const g=group({channel_id:'123',handle:'fixture_group',about:'approved rules',pinned_message_id:7,pinned_text:'approved pin',
    photo_sha256:createHash('sha256').update(jpg).digest('hex'),entities:[{type:'bold',offset:0,length:9}]});
  const job={id:'fixture',group:g,expected_user_id:'123456',expected_username:'ccapital_acces',random_id:'999'};
  const replies={
    'users.GetUsers':[{id:123456n,username:'ccapital_acces'}],
    'contacts.ResolveUsername':{peer:{className:'PeerChannel',channelId:123n},chats:[{id:123n,accessHash:456n}]},
    'channels.GetFullChannel':{chats:[{id:123n,username:g.handle,megagroup:true}],fullChat:{about:g.about,pinnedMsgId:7}},
    'channels.GetParticipant':{participant:{className:'ChannelParticipantSelf'}},
    'channels.GetMessages':{messages:[{id:7,message:'approved pin'}]},
    'messages.GetHistory':{messages:[{className:'Message',id:8,fromId:{className:'PeerUser',userId:789n},out:false}]},
    'upload.SaveFilePart':true,
    'messages.SendMedia':{updates:[{className:'UpdateMessageID',randomId:999n,id:88}]},
    'messages.SendMessage':{className:'UpdateShortSentMessage',id:99},
  };
  change({g,job,replies});
  const client={async connect(){connections++;},async destroy(){destroyed++;},async invoke(r,dc,options){
    calls.push(r);assert.equal(dc,undefined);assert.equal(options.maxRetryCount,0);assert.equal(options.floodSleepThreshold,0);assert.ok(options.timeout<=15000);
    if(r.className===errorAt?.at)throw errorAt.error;
    assert.ok(Object.hasOwn(replies,r.className),'unexpected RPC '+r.className);return replies[r.className];
  }};
  const session={async load(){},authKey:{getKey:()=>Buffer.alloc(256,1)}};
  const transport=new TelegramTransport({client,session,assets:{fetch:async()=>new Response(jpg)},now:()=>NOW});
  return {transport,job,calls,session,replies,counts:()=>({connections,destroyed})};
}
test('MTProto mock: complete photo path verifies identity, peer, rules, parts, random ID and bold',async()=>{
  const x=setup();assert.equal((await x.transport.prepare(x.job)).kind,'ready');
  assert.deepEqual(await x.transport.send(x.job,()=>true),{kind:'sent',message_id:'88'});
  const send=x.calls.find(x=>x.className==='messages.SendMedia');
  assert.equal(send.randomId,999n);assert.equal(send.entities[0].className,'MessageEntityBold');
  assert.equal(send.message,x.job.group.text);assert.ok(send.getBytes().length);
  assert.equal((await x.transport.send(x.job)).kind,'uncertain');
  assert.equal(x.calls.filter(x=>x.className==='messages.SendMedia').length,1);
  await x.transport.close();assert.equal(x.counts().destroyed,1);
});
test('MTProto mock: identity/peer/pin/Stars/rights mismatches never reach upload or send',async()=>{
  for(const change of [
    ({replies})=>replies['users.GetUsers'][0].id=999n,
    ({replies})=>replies['users.GetUsers'][0].username='wrong_account',
    ({replies})=>replies['contacts.ResolveUsername'].peer.channelId=999n,
    ({replies})=>replies['channels.GetMessages'].messages[0].message='new rules',
    ({replies})=>replies['channels.GetFullChannel'].fullChat.sendPaidMessagesStars=1n,
    ({replies})=>replies['channels.GetFullChannel'].chats[0].defaultBannedRights={sendPhotos:true},
    ({replies})=>replies['channels.GetParticipant'].participant={className:'ChannelParticipantAdmin',adminRights:{anonymous:true}},
  ]) {
    const x=setup(change);assert.ok(['blocked','account_halt'].includes((await x.transport.prepare(x.job)).kind));
    assert.equal(x.calls.some(x=>/SendMedia|SendMessage|SaveFilePart/.test(x.className)),false);
  }
});
test('MTProto mock: no existing auth key means no connection or login',async()=>{
  const x=setup();x.session.authKey.getKey=()=>undefined;
  assert.equal((await x.transport.prepare(x.job)).kind,'account_halt');assert.equal(x.counts().connections,0);assert.equal(x.calls.length,0);
});
test('MTProto mock: altered photo and future slowmode never send',async()=>{
  const x=setup(({g})=>g.photo_sha256='0'.repeat(64));assert.equal((await x.transport.prepare(x.job)).kind,'blocked');
  assert.equal(x.calls.some(x=>/SaveFilePart/.test(x.className)),false);
  const y=setup(({replies})=>replies['channels.GetFullChannel'].fullChat.slowmodeNextSendDate=(NOW+45000)/1000);
  assert.deepEqual(await y.transport.prepare(y.job),{kind:'slowmode',retry_after_ms:46000});
});
test('MTProto mock: text has no upload, preview or unintended formatting',async()=>{
  const x=setup(({g})=>{g.paid=false;g.format='text';g.entities=[];});await x.transport.prepare(x.job);
  assert.deepEqual(await x.transport.send(x.job,()=>true),{kind:'sent',message_id:'99'});
  assert.equal(x.calls.some(x=>x.className==='upload.SaveFilePart'),false);
  assert.equal(x.calls.at(-1).noWebpage,true);
});
test('MTProto mock: timeout after publication is uncertain, never repeated',async()=>{
  const x=setup(()=>{},{at:'messages.SendMedia',error:Error('timeout')});await x.transport.prepare(x.job);
  assert.equal((await x.transport.send(x.job,()=>true)).kind,'uncertain');
  await x.transport.send(x.job);assert.equal(x.calls.filter(x=>x.className==='messages.SendMedia').length,1);
});
test('MTProto mock: FloodWait returned as durable delay, unknown preflight is not sent',async()=>{
  class FloodWaitError extends Error{seconds=60;}
  const x=setup(()=>{},{at:'upload.SaveFilePart',error:new FloodWaitError()});
  assert.deepEqual(await x.transport.prepare(x.job),{kind:'flood',retry_after_ms:61000});
  assert.equal(classify(Error('no connection'),true).kind,'preflight_failed');
  assert.equal(ONE_CALL.maxRetryCount,0);
});
test('owner converter format loads in pinned Teleproto using dummy bytes only',async()=>{
  const r=spawnSync('python3',['-c',"import sys;sys.path.insert(0,'tools');from owner_secrets import encode_existing_session;print(encode_existing_session(1,'203.0.113.1',443,b'\\x01'*256))"],{encoding:'utf8'});
  assert.equal(r.status,0);const session=new StringSession(r.stdout.trim());await session.load();
  assert.equal(session.dcId,1);assert.equal(session.serverAddress,'203.0.113.1');assert.equal(session.port,443);assert.equal(session.authKey.getKey().length,256);
});
test('read-only acceptance verifies photo locally without uploading or permitting send',async()=>{
  const x=setup();assert.equal((await x.transport.prepare(x.job,{upload:false})).kind,'ready');
  assert.equal(x.calls.some(x=>/SaveFilePart|SendMedia|SendMessage/.test(x.className)),false);
  assert.equal((await x.transport.send(x.job)).kind,'uncertain');
  assert.equal(x.calls.some(x=>/SendMedia|SendMessage/.test(x.className)),false);
});
test('last actual message ours, unreadable, or changed during upload always skips',async()=>{
  for(const change of [
    ({replies})=>replies['messages.GetHistory'].messages[0].fromId.userId=123456n,
    ({replies})=>replies['messages.GetHistory'].messages=[],
    ({replies})=>replies['messages.GetHistory'].messages[0].out=true,
  ]) {
    const x=setup(change);assert.equal((await x.transport.prepare(x.job)).kind,'skipped');
    assert.equal(x.calls.some(x=>/SaveFilePart|SendMedia|SendMessage/.test(x.className)),false);
  }
  const y=setup();await y.transport.prepare(y.job);y.replies['messages.GetHistory'].messages[0].out=true;
  assert.deepEqual(await y.transport.send(y.job,()=>true),{kind:'skipped',reason:'last_message_ours'});
  assert.equal(y.calls.some(x=>/SendMedia|SendMessage/.test(x.className)),false);
  const z=setup(()=>{},{at:'messages.GetHistory',error:Error('read unavailable')});
  assert.deepEqual(await z.transport.prepare(z.job),{kind:'skipped',reason:'last_message_unreadable'});
});
test('durable stop fence is checked after the last-message read',async()=>{
  const x=setup();await x.transport.prepare(x.job);
  assert.deepEqual(await x.transport.send(x.job,()=>false),{kind:'cancelled'});
  assert.equal(x.calls.some(x=>/SendMedia|SendMessage/.test(x.className)),false);
});
