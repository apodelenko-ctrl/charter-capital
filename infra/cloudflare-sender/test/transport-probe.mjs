import {Api} from 'teleproto';
import {IGE} from 'teleproto/crypto/IGE.js';
import {Buffer} from 'node:buffer';
import {classify,extractMessageId,checkLivePolicy} from '../src/telegram.mjs';
export default {
  async fetch() {
    // Fixed cryptographic test vectors only; not account or API credentials.
    const key=Buffer.alloc(32,7),iv=Buffer.alloc(32,9),plain=Buffer.alloc(512*1024,3);
    const start=Date.now();
    const encrypted=new IGE(key,iv).encryptIge(plain);
    const decrypted=new IGE(key,iv).decryptIge(encrypted);
    const peer=new Api.InputPeerChannel({channelId:123n,accessHash:456n});
    const photo=new Api.InputMediaUploadedPhoto({file:new Api.InputFile({id:1n,parts:1,name:'fixture.jpg',md5Checksum:''})});
    const request=new Api.messages.SendMedia({peer,media:photo,message:'Fixture',randomId:7n,entities:[]});
    const group={channel_id:'123',handle:'fixture',about:'rules',pinned_message_id:null,pinned_text:'',format:'photo',slowmode_ms:0};
    const full={chats:[{id:123n,username:'fixture',megagroup:true}],fullChat:{about:'rules'}};
    const participant={participant:{className:'ChannelParticipantSelf'}};
    const allowed=checkLivePolicy(group,full,participant,'',Date.now());
    full.chats[0].defaultBannedRights={sendPhotos:true};
    const photoDenied=checkLivePolicy(group,full,participant,'',Date.now());
    const unknown=extractMessageId({updates:[]},'7');
    const found=extractMessageId({updates:[{className:'UpdateMessageID',randomId:7n,id:42}]},'7');
    return Response.json({cryptoRoundtrip:plain.equals(decrypted),cryptoWallMs:Date.now()-start,
      serializedPhotoRequestBytes:request.getBytes().length,allowed,photoDenied,unknown,found,
      ambiguous:classify(new Error('network timeout')).kind,connections:0,sends:0});
  },
};
