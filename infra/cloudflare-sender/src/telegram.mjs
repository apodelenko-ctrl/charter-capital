// Candidate transport. Intentionally NOT wired into the production Worker yet.
// It must pass owner-approved, single-session acceptance after Mac is stopped.
import {connect} from 'cloudflare:sockets';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {TelegramClient,Api} from 'teleproto';
import {StringSession} from 'teleproto/sessions/index.js';
import {socketClass} from './socket.mjs';
const CloudflareSocket=socketClass(connect);
const oneCall={maxRetryCount:0,floodSleepThreshold:0,timeout:15000};

export function classify(error,preflight=false) {
  const name=error?.constructor?.name;
  if (name==='FloodWaitError' && Number.isSafeInteger(error.seconds) && error.seconds>0) return {kind:'flood',retry_after_ms:error.seconds*1000};
  if (name==='SlowModeWaitError' && Number.isSafeInteger(error.seconds) && error.seconds>0) return {kind:'slowmode',retry_after_ms:error.seconds*1000};
  if (['ChatWriteForbiddenError','ChannelPrivateError','UserBannedInChannelError','ChatAdminRequiredError','UserNotParticipantError'].includes(name)) return {kind:'blocked'};
  return {kind:preflight?'preflight_failed':'uncertain'};
}

export function extractMessageId(result,randomId) {
  if (result?.className==='UpdateShortSentMessage' && result.id>0) return String(result.id);
  const match=result?.updates?.find(u=>u.className==='UpdateMessageID' && String(u.randomId)===randomId);
  return match?.id>0?String(match.id):null;
}

export function checkLivePolicy(group,full,participant,pinnedText,now) {
  const channel=full.chats?.find(x=>String(x.id)===group.channel_id);
  if (!channel || channel.left || !channel.megagroup || (channel.username || '').toLowerCase()!==group.handle.toLowerCase()) return 'peer_changed';
  if (BigInt(channel.sendPaidMessagesStars || 0)>0n || BigInt(full.fullChat.sendPaidMessagesStars || 0)>0n) return 'stars_required';
  if (full.fullChat.about!==group.about || (full.fullChat.pinnedMsgId || null)!==(group.pinned_message_id || null) || pinnedText!==(group.pinned_text || '')) return 'rules_changed';
  const member=participant.participant;
  if (!member || !['ChannelParticipant','ChannelParticipantSelf','ChannelParticipantAdmin','ChannelParticipantCreator','ChannelParticipantBanned'].includes(member.className) || member.left) return 'not_member';
  const admin=['ChannelParticipantAdmin','ChannelParticipantCreator'].includes(member.className);
  if (admin && member.adminRights?.anonymous) return 'anonymous_admin';
  for (const rights of [member.bannedRights,admin?null:channel.defaultBannedRights]) {
    if (rights && (rights.viewMessages || rights.sendMessages || rights.sendPlain || group.format==='photo' && (rights.sendMedia || rights.sendPhotos))) return 'write_restricted';
  }
  if ((full.fullChat.slowmodeSeconds || 0)*1000>group.slowmode_ms) return 'slowmode_changed';
  if ((full.fullChat.slowmodeNextSendDate || 0)*1000>now) return 'slowmode_wait';
  return null;
}

export class TelegramTransport {
  constructor({session,apiId,apiHash,assets}) {
    if (!session || !Number.isSafeInteger(apiId) || apiId<=0 || !/^[a-f\d]{32}$/i.test(apiHash || '')) throw Error('existing_credentials_required');
    const parsed=new StringSession(session);
    this.session=parsed;
    this.client=new TelegramClient(parsed,apiId,apiHash,{networkSocket:CloudflareSocket,
      requestRetries:1,connectionRetries:1,reconnectRetries:0,autoReconnect:false,floodSleepThreshold:0,timeout:10});
    this.client.setLogLevel('none');
    this.assets=assets;
  }
  async invoke(request) {return this.client.invoke(request,undefined,oneCall);}
  async prepare(job) {
    try {
      const g=job.group;
      if (!/^[1-9]\d*$/.test(g.channel_id || '') || !/^-?\d+$/.test(g.access_hash || '') || !Object.hasOwn(g,'about')) return {kind:'blocked'};
      await this.session.load();
      if (this.session.authKey?.getKey()?.length!==256) return {kind:'blocked'};
      await this.client.connect();
      const users=await this.invoke(new Api.users.GetUsers({id:[new Api.InputUserSelf()]}));
      if (String(users[0]?.id)!==job.expected_user_id || users[0]?.bot || users[0]?.deleted) return {kind:'blocked'};
      this.peer=new Api.InputPeerChannel({channelId:BigInt(g.channel_id),accessHash:BigInt(g.access_hash)});
      this.channel=new Api.InputChannel({channelId:BigInt(g.channel_id),accessHash:BigInt(g.access_hash)});
      const full=await this.invoke(new Api.channels.GetFullChannel({channel:this.channel}));
      const participant=await this.invoke(new Api.channels.GetParticipant({channel:this.channel,participant:new Api.InputPeerSelf()}));
      let pinned='';
      if (full.fullChat.pinnedMsgId) {
        const p=await this.invoke(new Api.channels.GetMessages({channel:this.channel,id:[new Api.InputMessageID({id:full.fullChat.pinnedMsgId})]}));
        pinned=p.messages?.[0]?.message;
      }
      if (checkLivePolicy(g,full,participant,pinned,Date.now())) return {kind:'blocked'};
      if (g.format==='photo') {
        if (!this.assets) return {kind:'blocked'};
        const response=await this.assets.fetch(new Request('https://assets.invalid'+g.photo_asset));
        if (!response.ok) return {kind:'blocked'};
        const reader=response.body.getReader();let size=0;const chunks=[];
        while (true) {const r=await reader.read();if(r.done)break;size+=r.value.length;
          if(size>10*1024*1024){await reader.cancel();return {kind:'blocked'};}chunks.push(Buffer.from(r.value));}
        const data=Buffer.concat(chunks);
        if (data.length<4 || data.readUInt16BE(0)!==0xffd8 || data.readUInt16BE(data.length-2)!==0xffd9 || createHash('sha256').update(data).digest('hex')!==g.photo_sha256) return {kind:'blocked'};
        const random=new BigUint64Array(1);crypto.getRandomValues(random);const fileId=random[0]&0x7fffffffffffffffn;
        const sizePart=512*1024;const parts=Math.ceil(data.length/sizePart);
        for(let part=0;part<parts;part++) {
          const ok=await this.invoke(new Api.upload.SaveFilePart({fileId,filePart:part,bytes:data.subarray(part*sizePart,(part+1)*sizePart)}));
          if(ok!==true)return {kind:'preflight_failed'};
        }
        this.media=new Api.InputMediaUploadedPhoto({file:new Api.InputFile({id:fileId,parts,name:'campaign.jpg',md5Checksum:createHash('md5').update(data).digest('hex')})});
      }
      return {kind:'ready'};
    } catch(error) {return classify(error,true);}
  }
  async send(job) {
    try {
      const g=job.group;
      const entities=(g.entities || []).map(e=>{
        if(e.type!=='bold' || !Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.length) || e.offset<0 || e.length<1 || e.offset+e.length>g.text.length) throw Error('invalid_entity');
        return new Api.MessageEntityBold({offset:e.offset,length:e.length});
      });
      const params={peer:this.peer,message:g.text,randomId:BigInt(job.random_id),entities};
      const request=g.format==='photo'?new Api.messages.SendMedia({...params,media:this.media}):new Api.messages.SendMessage({...params,noWebpage:true});
      const result=await this.invoke(request);
      const message_id=extractMessageId(result,job.random_id);
      return message_id?{kind:'sent',message_id}:{kind:'uncertain'};
    } catch(error) {return classify(error,false);}
  }
  async close() {await this.client.destroy();}
}
