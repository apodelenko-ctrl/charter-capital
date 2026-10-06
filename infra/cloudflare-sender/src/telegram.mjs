// Cloudflare construction only. Core is injectable and tested without a session.
import {connect} from 'cloudflare:sockets';
import {TelegramClient} from 'teleproto';
import {StringSession} from 'teleproto/sessions/index.js';
import {socketClass} from './socket.mjs';
import {TelegramTransport as CoreTransport} from './telegram-core.mjs';
export {classify,extractMessageId,checkLivePolicy} from './telegram-core.mjs';
const CloudflareSocket=socketClass(connect);
export class TelegramTransport extends CoreTransport {
  constructor({session,apiId,apiHash,assets}) {
    if (!session || !Number.isSafeInteger(apiId) || apiId<=0 || !/^[a-f\d]{32}$/i.test(apiHash || '')) throw Error('existing_credentials_required');
    const parsed=new StringSession(session);
    const client=new TelegramClient(parsed,apiId,apiHash,{networkSocket:CloudflareSocket,
      requestRetries:1,connectionRetries:1,reconnectRetries:0,autoReconnect:false,floodSleepThreshold:0,timeout:10});
    client.setLogLevel('none');
    super({client,session:parsed,assets});
  }
}
