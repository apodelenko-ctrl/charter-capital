// Prepared integration only; never deployed by the sender's Wrangler config.
// Put this beside a reviewed copy of the existing desk Worker and Engine.
import original,{DeskObject as ExistingDeskObject} from './desk-original.mjs';
import {Engine} from './engine.mjs';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {enqueueReport} from './report.mjs';

export class DeskObject extends ExistingDeskObject {
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
    if(!path.startsWith('/admin/sender/'))return super.fetch(request);
    const name=path.slice('/admin/sender/'.length),methods={status:'status',stop:'stop',import:'importSnapshot',export:'exportSnapshot',review:'reviewAttempt',rules:'updateGroup',activate:'activate',health:'reportHealth',preflight:'preflight'};
    const method=methods[name];if(!method)return new Response('Not found',{status:404});
    const read=['status','health','export'].includes(name);
    if(request.method!==(read?'GET':'POST'))return new Response('Method not allowed',{status:405});
    try {
      let body;
      if(['import','review','rules','preflight'].includes(name)) {
        const size=Number(request.headers.get('content-length') || 0);
        if(size>8*1024*1024)return new Response('Too large',{status:413});
        const bytes=await request.arrayBuffer();if(bytes.byteLength>8*1024*1024)return new Response('Too large',{status:413});
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
