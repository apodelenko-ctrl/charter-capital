// Cloudflare construction only. Core is injectable and tested without a session.
import {connect} from 'cloudflare:sockets';
import {TelegramClient} from 'teleproto';
import {StringSession} from 'teleproto/sessions/index.js';
import {ConnectionTCPFull} from 'teleproto/network/connection/TCPFull.js';
import {socketClass} from './socket.mjs';
import {TelegramTransport as CoreTransport,safeDiagnostic} from './telegram-core.mjs';
export {classify,extractMessageId,checkLivePolicy} from './telegram-core.mjs';
export class TelegramTransport extends CoreTransport {
  constructor({session,apiId,apiHash,assets}) {
    if (!session || !Number.isSafeInteger(apiId) || apiId<=0 || !/^[a-f\d]{32}$/i.test(apiHash || '')) throw Error('existing_credentials_required');
    const parsed=new StringSession(session);
    let networkFailure;
    const record=(error,stage)=>{networkFailure??={...safeDiagnostic(error,stage),code:Number.isSafeInteger(error?.code)?error.code:null};};
    const CloudflareSocket=socketClass(connect,record);
    class DiagnosedConnection extends ConnectionTCPFull {
      async _recv(){try{return await super._recv();}catch(error){record(error,'tcp_packet');throw error;}}
    }
    const client=new TelegramClient(parsed,apiId,apiHash,{networkSocket:CloudflareSocket,
      connection:DiagnosedConnection,
      requestRetries:1,connectionRetries:1,reconnectRetries:0,autoReconnect:false,floodSleepThreshold:0,timeout:10});
    client.setLogLevel('none');
    super({client,session:parsed,assets});
    this.networkDiagnostic=()=>networkFailure || null;
  }
}
