// Prepared integration only; never deployed by the sender's Wrangler config.
// Put this beside a reviewed copy of the existing desk Worker and Engine.
import original,{DeskObject as ExistingDeskObject} from './desk-original.mjs';
import {Engine} from './engine.mjs';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {enqueueReport} from './report.mjs';

async function readUpdate(request){
  const reader=request.body?.getReader();if(!reader)throw Error('body');
  let size=0;const parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>262144){await reader.cancel();throw Error('size');}parts.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class DeskObject extends ExistingDeskObject {
  async senderCommand(update,command){
    return this.ctx.blockConcurrencyWhile(async()=>{
      const state=this.load(),message=update.message;
      if(!state.importedAt || !state.active)return new Response('Not ready',{status:503});
      if(!Number.isSafeInteger(update.update_id))return new Response('Invalid update',{status:400});
      if(message?.from?.id!==state.config.owner_id || message?.chat?.id!==state.config.owner_id || message?.chat?.type!=='private')return null;
      if(state.updates.includes(update.update_id))return new Response('OK');
      const stopping=['/pause_ads','/sender_stop'].includes(command);
      let status;
      try{status=await this.env.SENDER_CONTROL[stopping?'stop':'status']();}
      catch{return new Response('Sender operation not confirmed',{status:503});}
      const wait=status.wait_until>Date.now()?Math.ceil((status.wait_until-Date.now())/1000):0;
      const text=['Charter Capital · облачная рассылка',
        `Отправитель: ${status.enabled?'включён':'остановлен'}.`,
        `Групп в журнале: ${status.group_count || 0}; блокировок: ${status.blocked_groups || 0}.`,
        `Текущий запрос: ${status.attempts?.pending || 0}; требуют сверки: ${status.attempts?.uncertain || 0}.`,
        status.halt?'Остановка: '+String(status.halt).slice(0,100):null,
        wait?`Ожидание Telegram: ещё ${wait} сек.`:null,
        stopping && status.attempts?.pending?'Начатый запрос завершится с сохранением результата; автоматического повтора не будет.':null,
        '/groups — состояние рассылки · /pause_ads — остановить рассылку.'
      ].filter(Boolean).join('\n');
      const engine=new Engine(state);engine.uid=String(update.update_id);
      engine.enqueue('owner',{chat_id:state.config.owner_id,text},null,'charter-sender-command:'+update.update_id);
      state.updates.push(update.update_id);state.lastEvent=new Date().toISOString();
      await this.schedule(state);this.save(state);return new Response('OK');
    });
  }
  async acceptSenderReport(report) {
    return this.ctx.blockConcurrencyWhile(async()=>{
      const state=this.load(),receipt=enqueueReport(state,Engine,report);
      await this.schedule(state);this.save(state);
      return {...receipt,state:state.active?receipt.state:'blocked'};
    });
  }
  async senderWatchdog(hour) {
    let health;
    try{health=await this.env.SENDER_CONTROL.reportHealth();}catch{health={unreachable:true};}
    const delayed=health.reports?.some(r=>r.hour<=hour-3600000 && r.state!=='sent');
    if(!health.unreachable && !health.report_late && !delayed)return {alert:false};
    return this.ctx.blockConcurrencyWhile(async()=>{
      const state=this.load();
      if(!state.importedAt)return {alert:false};
      new Engine(state).enqueue('owner',{chat_id:state.config.owner_id,text:'Charter Capital: облачный отправитель или его почасовой отчёт не подтверждён. Проверьте состояние. Автоматического повторения публикаций не выполнялось.'},null,'charter-sender-watchdog:'+hour);
      await this.schedule(state);this.save(state);return {alert:true};
    });
  }
  async fetch(request) {
    // Only reached through the original Worker's existing ADMIN_SECRET check.
    const path=new URL(request.url).pathname;
    // Original fetch already checks WEBHOOK_SECRET; the command also requires
    // the existing owner and the owner's private chat, with durable deduplication.
    if(path==='/telegram' && request.method==='POST'){
      let update;try{update=await readUpdate(request.clone());}catch{return new Response('Invalid update',{status:400});}
      const command=String(update.message?.text || '').trim().split(/\s+/)[0].split('@')[0].toLowerCase();
      if(['/groups','/pause_ads','/sender_status','/sender_stop'].includes(command)){
        const response=await this.senderCommand(update,command);if(response)return response;
      }
    }
    if(!path.startsWith('/admin/sender/'))return super.fetch(request);
    const name=path.slice('/admin/sender/'.length),methods={status:'status',stop:'stop',import:'importSnapshot',export:'exportSnapshot',review:'reviewAttempt',rules:'updateGroup',activate:'activate',health:'reportHealth',preflight:'preflight',cutover:'acknowledgeCutover',recent:'recent'};
    const method=methods[name];if(!method)return new Response('Not found',{status:404});
    const read=['status','health','export','recent'].includes(name);
    if(request.method!==(read?'GET':'POST'))return new Response('Method not allowed',{status:405});
    try {
      let body;
      if(['import','review','rules','preflight','cutover'].includes(name)) {
        const size=Number(request.headers.get('content-length') || 0);
        if(size>32*1024*1024)return new Response('Too large',{status:413});
        const bytes=await request.arrayBuffer();if(bytes.byteLength>32*1024*1024)return new Response('Too large',{status:413});
        body=JSON.parse(new TextDecoder().decode(bytes));
      }
      const result=await this.env.SENDER_CONTROL[method](...(body?[body]:[]));
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch{return new Response('Sender operation refused; inspect private status',{status:409});}
  }
}
export class SenderReports extends WorkerEntrypoint {
  async accept(report){return this.env.DESK.getByName('production').acceptSenderReport(report);}
}
export default {
  fetch:original.fetch,
  async scheduled(event,env){await env.DESK.getByName('production').senderWatchdog(Math.floor(event.scheduledTime/3600000)*3600000);}
};
