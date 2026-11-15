import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeLedger} from './helpers.mjs';
import {Ledger,HOUR} from '../src/ledger.mjs';
import {formattingVisible,SHORT_TEXT} from '../src/content.mjs';
import {checkLivePolicy,photoDimensions} from '../src/telegram-core.mjs';
import {group,snapshot,NOW} from './fixtures.mjs';

function rotating(){const a=group(),payload={text:'A',format:'photo',entities:[],digest:a.digest,photo_sha256:a.photo_sha256,photo_asset:a.photo_asset};return group({handle:'obmen_valyuty',interval_ms:150000,paid_day_interval_seconds:150,
  rotation:{campaign:'paid-ab-20261006',variants:{A:payload,B:{...payload,text:'B',photo_asset:'/b.png'}}}});}
test('A/B follows confirmed visibility, survives restart, and never advances on ACK alone',()=>{
  const {ledger:l,storage}=makeLedger(snapshot({groups:[rotating()]}));l.activate();
  const a=l.claim(NOW,'a','111');assert.equal(a.group.paid_variant,'A');assert.ok(l.arm(a,NOW));
  l.finish(a,{kind:'sent',message_id:1},NOW);
  assert.equal(l.claim(NOW+600000,'duplicate','112'),null);
  const restart=new Ledger(storage);restart.recover();const verify=restart.visibilityJob(NOW);
  assert.equal(verify.id,'a');restart.finishVisibility(verify,{kind:'verified'},NOW+1000);
  const b=restart.claim(NOW+600000,'b','113');assert.equal(b.group.paid_variant,'B');restart.arm(b,NOW+600000);
  restart.finish(b,{kind:'sent',message_id:2},NOW+600000);
  restart.finishVisibility(b,{kind:'visibility_mismatch'},NOW+601000);
  assert.equal(restart.claim(NOW+1200000,'retry','114'),null);
  assert.deepEqual(restart.rows('SELECT variant,confirmed FROM paid_variants ORDER BY rowid').map(x=>[x.variant,x.confirmed]),[['A',1],['B',0]]);
});
test('preflight skip/crash does not use daily allowance; armed crash remains uncertain',()=>{
  const {ledger:l,storage}=makeLedger(snapshot({daily_limit:1}));l.activate();
  const a=l.claim(NOW,'a','1');l.finish(a,{kind:'skipped',reason:'last_message_ours'},NOW);
  assert.equal(l.used(0,NOW),0);
  const b=l.claim(NOW+60000,'b','2');assert.ok(b);const r=new Ledger(storage);r.recover();
  assert.equal(r.status().enabled,true);assert.equal(r.status().attempts.uncertain,undefined);
  const c=r.claim(NOW+120000,'c','3');assert.ok(r.arm(c,NOW+120000));r.recover();
  assert.equal(r.status().enabled,false);assert.equal(r.status().attempts.uncertain,1);assert.equal(r.used(0,NOW+120000),1);
});
test('stop during deferred verification cannot enable sender or remove an unrelated hold',()=>{
  const {ledger:l}=makeLedger();l.activate();const j=l.claim(NOW,'a','1');l.arm(j,NOW);l.finish(j,{kind:'sent',message_id:1},NOW);
  l.sql.exec('INSERT OR REPLACE INTO blocked VALUES(?,?)',j.group.chat_id,'owner_hold');l.stop();
  l.finishVisibility(j,{kind:'verified'},NOW+1);assert.equal(l.status().enabled,false);
  assert.equal(l.rows('SELECT reason FROM blocked')[0].reason,'owner_hold');
});
test('visibility FloodWait holds both segments and never schedules a resend',()=>{
  const {ledger:l}=makeLedger(snapshot({groups:[group(),group({chat_id:-100456,paid:false})]}));l.activate();
  const j=l.claim(NOW,'a','1');l.arm(j,NOW);l.finish(j,{kind:'sent',message_id:1},NOW);
  l.finishVisibility(j,{kind:'flood',retry_after_ms:600000},NOW);
  assert.equal(l.claim(NOW+599999,'b','2'),null);assert.ok(l.claim(NOW+600000,'b','2'));
  assert.equal(l.rows('SELECT state FROM visibility')[0].state,'quarantined');
});
test('saved visibility requires exact text, photo and UTF-16 bold coverage',()=>{
  const spec={text:'Текст @contact',format:'photo',entities:[{type:'bold',offset:0,length:14}]};
  const msg={className:'Message',message:spec.text,media:{className:'MessageMediaPhoto',photo:{className:'Photo'}},entities:[{className:'MessageEntityBold',offset:0,length:6},{className:'MessageEntityBold',offset:6,length:8}]};
  assert.equal(formattingVisible(msg,spec),true);assert.equal(formattingVisible({...msg,media:null},spec),false);
  assert.equal(formattingVisible({...msg,message:'other'},spec),false);assert.equal(formattingVisible({...msg,entities:[]},spec),false);
  assert.equal(formattingVisible(msg,{...spec,entities:[{type:'bold',offset:0,length:6}],exact_bold:true}),false);
});
test('broadcast exception is only the approved channel DM mirror; Stars spending remains forbidden',()=>{
  const g=group({chat_id:-1001422420951,channel_id:'1422420951',handle:'obmen_valyuty',broadcast_channel_approved:true,about:'rules',pinned_text:'',slowmode_ms:0,paid_day_interval_seconds:150});
  const channel={id:1422420951n,username:g.handle,broadcast:true,megagroup:false,linkedMonoforumId:9n};
  const full={chats:[channel],fullChat:{about:'rules',sendPaidMessagesStars:25n,slowmodeSeconds:300}};
  const admin={participant:{className:'ChannelParticipantAdmin',adminRights:{postMessages:true}}};
  assert.equal(checkLivePolicy({...g},full,admin,'',NOW),null);
  assert.equal(checkLivePolicy({...g,broadcast_channel_approved:false},full,admin,'',NOW),'peer_changed');
  assert.equal(checkLivePolicy({...g},{...full,chats:[{...channel,sendPaidMessagesStars:1n}]},admin,'',NOW),'stars_required');
  assert.equal(checkLivePolicy({...g},{...full,chats:[{...channel,monoforum:true}]},admin,'',NOW),'stars_required');
  assert.equal(checkLivePolicy({...g},full,{participant:{className:'ChannelParticipantSelf'}},'',NOW),'channel_post_permission_missing');
});
test('approved short contact text and unreadable pin exception stay narrow',()=>{
  const g=group({paid:false,format:'text',text:SHORT_TEXT,allow_links:false,allow_photos:false,allow_contact_handles:true,content_variant:'short_text',format_evidence:'Owner-reviewed exact format',format_checked_at:'2026-10-07T00:00:00Z',
    handle:'Siberia_USDT',channel_id:'123',about:'В группе разрешено размещать 2 сообщения в сутки длиной до 2 строк',pinned_message_id:5,pinned_text:'',permission:'free',unreadable_pin_policy:'reviewed_description_exchange_offer',actual_daily_limit:2,max_lines:2,interval_ms:3600000});
  const full={chats:[{id:123n,username:g.handle,megagroup:true}],fullChat:{about:g.about,pinnedMsgId:5}};
  const member={participant:{className:'ChannelParticipantSelf'}};
  assert.equal(checkLivePolicy({...g},full,member,undefined,NOW),null);
  assert.equal(checkLivePolicy({...g,actual_daily_limit:3},full,member,undefined,NOW),'rules_changed');
  assert.equal(checkLivePolicy({...g},full,member,'New readable rules',NOW),'rules_changed');
  const {db}=makeLedger(snapshot({groups:[g]}));db.close();
  assert.throws(()=>makeLedger(snapshot({groups:[{...g,allow_contact_handles:false}]})),/contact|short_text/);
});
test('PNG B asset is supported with dimensions checked, not rewritten',()=>{
  const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1280,16);png.writeUInt32BE(720,20);
  assert.deepEqual(photoDimensions(png),{width:1280,height:720});png.writeUInt32BE(0,16);assert.throws(()=>photoDimensions(png),/invalid_png/);
});
test('both hourly segments distinguish API acknowledgement, verification and checks',()=>{
  const {ledger:l}=makeLedger();l.activate();const j=l.claim(NOW,'a','1');l.arm(j,NOW);l.finish(j,{kind:'sent',message_id:1},NOW);
  const report=l.hourly(NOW+HOUR);assert.equal(report.paid.sent,1);assert.equal(report.visibility[0].state,'pending');
  assert.equal(report.used_24h,1);assert.deepEqual(l.hourly(NOW+HOUR),report);
});
