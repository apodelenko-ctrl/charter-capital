import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {Api} from 'teleproto';

export const ONE_CALL=Object.freeze({maxRetryCount:0,floodSleepThreshold:0,timeout:15000});
export function classify(error,preflight=false) {
  const name=error?.constructor?.name;
  if (['FloodWaitError','FloodTestPhoneWaitError'].includes(name) && Number.isSafeInteger(error.seconds) && error.seconds>0)
    return {kind:'flood',retry_after_ms:(error.seconds+1)*1000};
  if (name==='SlowModeWaitError' && Number.isSafeInteger(error.seconds) && error.seconds>0)
    return {kind:'slowmode',retry_after_ms:(error.seconds+1)*1000};
  if (['ChatWriteForbiddenError','ChannelPrivateError','UserBannedInChannelError','ChatAdminRequiredError','UserNotParticipantError'].includes(name)) return {kind:'blocked'};
  if (['PeerFloodError','AuthKeyUnregisteredError','SessionRevokedError','UserDeactivatedError','AuthKeyDuplicatedError'].includes(name)) return {kind:'account_halt'};
  return {kind:preflight?'preflight_failed':'uncertain'};
}
export function extractMessageId(result,randomId) {
  if (result?.className==='UpdateShortSentMessage' && result.id>0) return String(result.id);
  const match=result?.updates?.find(u=>u.className==='UpdateMessageID' && String(u.randomId)===randomId);
  return match?.id>0?String(match.id):null;
}
export function checkLivePolicy(g,full,participant,pinnedText,now) {
  const channel=full.chats?.find(x=>String(x.id)===g.channel_id);
  if (!channel || channel.left || !channel.megagroup || (channel.username || '').toLowerCase()!==g.handle.toLowerCase()) return 'peer_changed';
  if (BigInt(channel.sendPaidMessagesStars || 0)>0n || BigInt(full.fullChat?.sendPaidMessagesStars || 0)>0n) return 'stars_required';
  if ((full.fullChat?.about || '')!==g.about || (full.fullChat.pinnedMsgId || null)!==(g.pinned_message_id || null) || pinnedText!==(g.pinned_text || '')) return 'rules_changed';
  const member=participant?.participant;
  if (!member || !['ChannelParticipant','ChannelParticipantSelf','ChannelParticipantAdmin','ChannelParticipantCreator','ChannelParticipantBanned'].includes(member.className) || member.left) return 'not_member';
  if (member.className==='ChannelParticipantBanned' && member.bannedRights?.viewMessages) return 'not_member';
  const admin=['ChannelParticipantAdmin','ChannelParticipantCreator'].includes(member.className);
  if (admin && member.adminRights?.anonymous) return 'anonymous_admin';
  for (const rights of [member.bannedRights,admin?null:channel.defaultBannedRights]) {
    if (rights && (rights.viewMessages || rights.sendMessages || rights.sendPlain || g.format==='photo' && (rights.sendMedia || rights.sendPhotos))) return 'write_restricted';
  }
  if ((full.fullChat.slowmodeSeconds || 0)*1000>g.slowmode_ms) return 'slowmode_changed';
  if ((full.fullChat.slowmodeNextSendDate || 0)*1000>now) return 'slowmode_wait';
  return null;
}
export function jpegDimensions(data) {
  if(data.length<4 || data.readUInt16BE(0)!==0xffd8 || data.readUInt16BE(data.length-2)!==0xffd9) throw Error('invalid_jpeg');
  let at=2;
  while(at<data.length) {
    if(data[at++]!==255)break;
    while(data[at]===255)at++;
    const marker=data[at++];if(marker===0xda || marker===0xd9)break;
    if(at+2>data.length)break;const size=data.readUInt16BE(at);
    if(size<2 || at+size>data.length)break;
    if([0xc0,0xc1,0xc2].includes(marker)) {
      if(size<8)break;const h=data.readUInt16BE(at+3),w=data.readUInt16BE(at+5);
      if(!w || !h || w+h>10000 || Math.max(w,h)/Math.min(w,h)>20)break;
      return {width:w,height:h};
    }
    at+=size;
  }
  throw Error('invalid_jpeg_dimensions');
}

// Never logs requests, session strings, credentials, or server error messages.
export class TelegramTransport {
  constructor({client,session,assets,now=Date.now}) {
    this.client=client;this.session=session;this.assets=assets;this.now=now;
    this.prepared=false;this.attempted=false;this.aborted=false;
  }
  async invoke(request) {
    if(this.aborted || this.now()>this.deadline)throw Error('transport_deadline');
    return this.client.invoke(request,undefined,{...ONE_CALL,timeout:Math.min(15000,this.deadline-this.now())});
  }
  async latest(job) {
    try {
      const history=await this.invoke(new Api.messages.GetHistory({peer:this.peer,offsetId:0,offsetDate:0,addOffset:0,limit:1,maxId:0,minId:0,hash:0n}));
      const last=history?.messages?.[0];
      if(!last || last.className==='MessageEmpty' || !last.fromId)return {kind:'skipped',reason:'last_message_unreadable'};
      if(last.out || last.fromId.className==='PeerUser' && String(last.fromId.userId)===job.expected_user_id)return {kind:'skipped',reason:'last_message_ours'};
      return {kind:'ready'};
    }catch(error){
      const result=classify(error,true);
      return result.kind==='preflight_failed'?{kind:'skipped',reason:'last_message_unreadable'}:result;
    }
  }
  async prepare(job,{upload=true}={}) {
    if(this.jobId) return {kind:'preflight_failed'};
    this.jobId=job.id;this.deadline=this.now()+90_000;
    try {
      const g=job.group;
      if(!/^[1-9]\d*$/.test(g.channel_id || '') || !/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(g.handle) || typeof g.about!=='string')return {kind:'blocked'};
      await this.session.load();
      if(this.session.authKey?.getKey()?.length!==256)return {kind:'account_halt'};
      // No login/start(), no auth.exportAuthorization(), no session cache transfer.
      await this.client.connect();
      const users=await this.invoke(new Api.users.GetUsers({id:[new Api.InputUserSelf()]}));
      if(String(users[0]?.id)!==job.expected_user_id || users[0]?.bot || users[0]?.deleted ||
         (users[0]?.username || '').toLowerCase()!==job.expected_username)return {kind:'account_halt'};
      const resolved=await this.invoke(new Api.contacts.ResolveUsername({username:g.handle}));
      const channel=resolved.chats?.find(c=>String(c.id)===g.channel_id);
      if(resolved.peer?.className!=='PeerChannel' || String(resolved.peer.channelId)!==g.channel_id ||
         !channel?.accessHash || channel.min)return {kind:'blocked'};
      this.peer=new Api.InputPeerChannel({channelId:BigInt(g.channel_id),accessHash:channel.accessHash});
      this.channel=new Api.InputChannel({channelId:BigInt(g.channel_id),accessHash:channel.accessHash});
      const full=await this.invoke(new Api.channels.GetFullChannel({channel:this.channel}));
      const participant=await this.invoke(new Api.channels.GetParticipant({channel:this.channel,participant:new Api.InputPeerSelf()}));
      let pinned='';
      if(full.fullChat?.pinnedMsgId) {
        const p=await this.invoke(new Api.channels.GetMessages({channel:this.channel,id:[new Api.InputMessageID({id:full.fullChat.pinnedMsgId})]}));
        pinned=p.messages?.find(m=>m.id===full.fullChat.pinnedMsgId)?.message;
      }
      const blocked=checkLivePolicy(g,full,participant,pinned,this.now());
      if(blocked==='slowmode_wait')return {kind:'slowmode',retry_after_ms:full.fullChat.slowmodeNextSendDate*1000-this.now()+1000};
      if(blocked)return {kind:'blocked'};
      const latest=await this.latest(job);if(latest.kind!=='ready')return latest;
      if(g.format==='photo') {
        const response=await this.assets?.fetch(new Request('https://assets.invalid'+g.photo_asset));
        if(!response?.ok || !response.body)return {kind:'blocked'};
        const reader=response.body.getReader();let size=0;const chunks=[];
        while(true) {const r=await reader.read();if(r.done)break;size+=r.value.length;
          if(size>10*1024*1024){await reader.cancel();return {kind:'blocked'};}chunks.push(Buffer.from(r.value));}
        const data=Buffer.concat(chunks);jpegDimensions(data);
        if(createHash('sha256').update(data).digest('hex')!==g.photo_sha256)return {kind:'blocked'};
        if(!upload)return {kind:'ready'};
        const random=new BigUint64Array(1);crypto.getRandomValues(random);const fileId=random[0]&0x7fffffffffffffffn;
        const partSize=512*1024,parts=Math.ceil(data.length/partSize);
        for(let part=0;part<parts;part++) {
          const ok=await this.invoke(new Api.upload.SaveFilePart({fileId,filePart:part,bytes:data.subarray(part*partSize,(part+1)*partSize)}));
          if(ok!==true)return {kind:'preflight_failed'};
        }
        this.media=new Api.InputMediaUploadedPhoto({file:new Api.InputFile({id:fileId,parts,name:'campaign.jpg',md5Checksum:createHash('md5').update(data).digest('hex')})});
      }
      this.prepared=upload;return {kind:'ready'};
    } catch(error){return classify(error,true);}
  }
  async send(job,canSend=()=>false) {
    if(!this.prepared || this.attempted || job.id!==this.jobId)return {kind:'uncertain'};
    // Re-read after photo upload, then recheck the durable stop/expiry fence.
    const latest=await this.latest(job);if(latest.kind!=='ready')return latest;
    if(!canSend())return {kind:'cancelled'};
    this.attempted=true;
    try {
      const g=job.group;
      const entities=(g.entities || []).map(e=>{
        if(e.type!=='bold' || !Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.length) || e.offset<0 || e.length<1 || e.offset+e.length>g.text.length)throw Error('invalid_entity');
        return new Api.MessageEntityBold({offset:e.offset,length:e.length});
      });
      const params={peer:this.peer,message:g.text,randomId:BigInt(job.random_id),entities};
      const request=g.format==='photo'?new Api.messages.SendMedia({...params,media:this.media}):new Api.messages.SendMessage({...params,noWebpage:true});
      const result=await this.invoke(request),message_id=extractMessageId(result,job.random_id);
      return message_id?{kind:'sent',message_id}:{kind:'uncertain'};
    } catch(error){return classify(error,false);}
  }
  async close(){this.aborted=true;await this.client.destroy();}
}
