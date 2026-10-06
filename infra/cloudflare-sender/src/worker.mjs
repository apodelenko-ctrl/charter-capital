import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { Ledger, HOUR, policyBlock } from './ledger.mjs';

// Compile-time fuse. Dashboard variables cannot turn this build into a live sender.
const LIVE_RELEASE = false;
const VERSION = '2026-10-06.offline.2';

export class Sender extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.ledger=new Ledger(ctx.storage);
    this.ledger.recover();
    this.running=false;
  }
  releaseEnabled() {return LIVE_RELEASE;}
  activationEvidence() {
    const evidence=this.ledger.meta('preflight'),source=this.ledger.meta('source');
    return source?.final===true && source.stopped_marker===true && evidence?.kind==='ready' &&
      evidence.epoch===this.ledger.control().epoch && Date.now()-evidence.at<15*60_000;
  }
  async makeTransport() {
    if(!this.releaseEnabled())throw Error('live_transport_not_released');
    const {TelegramTransport}=await import('./telegram.mjs');
    return new TelegramTransport({session:this.env.TG_SESSION,apiId:Number(this.env.TG_API_ID),apiHash:this.env.TG_API_HASH,assets:this.env.ASSETS});
  }
  async importSnapshot(data) {
    this.ledger.importSnapshot(data,Date.now());
    return this.ledger.status();
  }
  status() {return {...this.ledger.status(),version:VERSION,live_release:LIVE_RELEASE};}
  async stop() {
    this.ledger.stop();
    await this.ctx.storage.deleteAlarm();
    return this.status();
  }
  async activate() {
    if (!this.releaseEnabled()) throw Error('offline_build_cannot_activate');
    if(!this.activationEvidence())throw Error('fresh_stopped_mac_snapshot_and_preflight_required');
    this.ledger.activate();
    await this.ctx.storage.setAlarm(Date.now()+1000);
    return this.status();
  }
  async tick() {
    if (!this.releaseEnabled()) return {status:'offline_build'};
    if (this.running) return {status:'busy'};
    this.running=true;
    let job,transport;
    try {
      const random=new BigUint64Array(1);crypto.getRandomValues(random);
      job=this.ledger.claim(Date.now(),crypto.randomUUID(),String(random[0] & 0x7fffffffffffffffn));
      if (!job) return {status:'idle'};
      // Persist claim and a recovery wake-up before external I/O.
      await this.ctx.storage.setAlarm(Date.now()+120_000);
      await this.ctx.storage.sync();
      if (!this.ledger.validClaim(job,Date.now())) {
        this.ledger.finish(job,{kind:'cancelled'},Date.now());return {status:'cancelled'};
      }
      transport=await this.makeTransport();
      const ready=await transport.prepare(job);
      if (ready?.kind!=='ready') {
        this.ledger.finish(job,ready || {kind:'preflight_failed'},Date.now());return {status:'preflight_blocked'};
      }
      // stop/expiry can occur during membership checks or photo upload.
      if (!this.ledger.validClaim(job,Date.now())) {
        this.ledger.finish(job,{kind:'cancelled'},Date.now());return {status:'cancelled'};
      }
      const result=await transport.send(job,()=>this.ledger.validClaim(job,Date.now()));
      this.ledger.finish(job,result,Date.now());
      return {status:result?.kind || 'unknown'};
    } catch {
      // Unknown exceptions cannot prove Telegram did not receive a request.
      if (job) this.ledger.finish(job,{kind:'uncertain'},Date.now());
      return {status:'uncertain'};
    } finally {
      try {await transport?.close();} catch {}
      this.running=false;
      const next=this.ledger.nextWake(Date.now());
      if (next!=null) await this.ctx.storage.setAlarm(next);
      else await this.ctx.storage.deleteAlarm();
    }
  }
  async alarm() {await this.tick();}
  createReport(end) {return this.ledger.hourly(end);}
  async reportCycle(end) {
    this.ledger.reportsDue(end);
    if(!this.env.REPORTS)return {delivery:'binding_missing'};
    for(const item of this.ledger.reportQueue()) {
      try {
        const receipt=await this.env.REPORTS.accept(JSON.parse(item.body));
        if(!['pending','sent','uncertain','failed','blocked'].includes(receipt?.state))throw Error('invalid_receipt');
        this.ledger.reportState(item.hour,receipt.state);
      }catch{ /* Retry the same hour via the receiver's durable deduplication key. */ }
    }
    return {reports:this.ledger.status().reports};
  }
  reportHealth(now=Date.now()) {
    const status=this.ledger.status(),last=this.ledger.meta('last_report_end');
    return {initialized:status.initialized,enabled:status.enabled,halt:status.halt,last_report_end:last,
      report_late:status.initialized && (!last || now-last>70*60_000),reports:status.reports};
  }
  exportSnapshot() {
    if(this.running)throw Error('inflight_delivery_wait_for_completion');
    return this.ledger.exportSnapshot();
  }
  reviewAttempt(input) {if(this.running)throw Error('inflight_delivery');return this.ledger.reviewAttempt(input,Date.now());}
  updateGroup(group) {return this.ledger.updateGroup(group,Date.now());}
  async preflight(chat_id) {
    if(!this.releaseEnabled())throw Error('offline_build_cannot_connect');
    const c=this.ledger.control(),source=this.ledger.meta('source');
    if(this.running || c.enabled || !c.initialized || this.ledger.pending() || !source?.final || !source.stopped_marker || c.halt || c.wait_until>Date.now())throw Error('preflight_blocked');
    const row=this.ledger.rows('SELECT * FROM groups WHERE chat_id=?',chat_id)[0];
    if(!row || row.blocked || row.wait_until>Date.now() || this.ledger.rows('SELECT chat_id FROM blocked WHERE chat_id=?',chat_id).length ||
      this.ledger.rows("SELECT id FROM attempts WHERE chat_id=? AND status IN ('pending','uncertain') LIMIT 1",chat_id).length)throw Error('peer_held');
    const group=JSON.parse(row.spec);if(policyBlock(group,Date.now()))throw Error('policy_held');
    this.running=true;let transport,result;
    try {
      transport=await this.makeTransport();
      result=await transport.prepare({id:'read-only-preflight',group,expected_user_id:c.expected_user_id,expected_username:this.ledger.meta('expected_username')},{upload:false});
    }catch{result={kind:'preflight_failed'};}
    finally{try{await transport?.close();}catch{}this.running=false;}
    const evidence={kind:result?.kind || 'preflight_failed',at:Date.now(),epoch:c.epoch,chat_id};
    this.ledger.setMeta('preflight',evidence);
    if(result?.kind==='flood' && Number.isSafeInteger(result.retry_after_ms) && result.retry_after_ms>0)this.ledger.sql.exec('UPDATE control SET wait_until=MAX(wait_until,?) WHERE id=1',Date.now()+result.retry_after_ms);
    if(result?.kind==='account_halt')this.ledger.sql.exec("UPDATE control SET halt='account_requires_review' WHERE id=1");
    return evidence;
  }
}

// Access only through a deliberate service binding. No public administration route.
export class SenderControl extends WorkerEntrypoint {
  sender() {return this.env.SENDER.getByName('charter-primary-account');}
  async status() {return this.sender().status();}
  async stop() {return this.sender().stop();}
  async importSnapshot(snapshot) {return this.sender().importSnapshot(snapshot);}
  async activate() {return this.sender().activate();}
  async exportSnapshot() {return this.sender().exportSnapshot();}
  async reportHealth() {return this.sender().reportHealth();}
  async reviewAttempt(input) {return this.sender().reviewAttempt(input);}
  async updateGroup(group) {return this.sender().updateGroup(group);}
  async preflight(input) {return this.sender().preflight(input.chat_id);}
}

export default {
  async fetch(request) {
    if (request.method==='GET' && new URL(request.url).pathname==='/health') {
      return Response.json({service:'charter-cloudflare-sender',version:VERSION,live_release:LIVE_RELEASE},{headers:{'Cache-Control':'no-store'}});
    }
    return new Response('Not found',{status:404});
  },
  async scheduled(event,env) {
    // Own hourly cron at cutover, independent of send alarms. None configured now.
    await env.SENDER.getByName('charter-primary-account').reportCycle(Math.floor(event.scheduledTime/HOUR)*HOUR);
  },
};
