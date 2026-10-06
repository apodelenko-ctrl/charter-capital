import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { Ledger, HOUR } from './ledger.mjs';

// Compile-time fuse. Dashboard variables cannot turn this build into a live sender.
const LIVE_RELEASE = false;
const VERSION = '2026-10-06.offline.1';

export class Sender extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.ledger=new Ledger(ctx.storage);
    this.ledger.recover();
    this.running=false;
  }
  releaseEnabled() {return LIVE_RELEASE;}
  makeTransport() {throw Error('live_transport_not_released');}
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
      transport=this.makeTransport();
      const ready=await transport.prepare(job);
      if (ready?.kind!=='ready') {
        this.ledger.finish(job,ready || {kind:'preflight_failed'},Date.now());return {status:'preflight_blocked'};
      }
      // stop/expiry can occur during membership checks or photo upload.
      if (!this.ledger.validClaim(job,Date.now())) {
        this.ledger.finish(job,{kind:'cancelled'},Date.now());return {status:'cancelled'};
      }
      const result=await transport.send(job);
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
}

// Access only through a deliberate service binding. No public administration route.
export class SenderControl extends WorkerEntrypoint {
  sender() {return this.env.SENDER.getByName('charter-primary-account');}
  async status() {return this.sender().status();}
  async stop() {return this.sender().stop();}
  async importSnapshot(snapshot) {return this.sender().importSnapshot(snapshot);}
  async activate() {return this.sender().activate();}
}

export default {
  async fetch(request) {
    if (request.method==='GET' && new URL(request.url).pathname==='/health') {
      return Response.json({service:'charter-cloudflare-sender',version:VERSION,live_release:LIVE_RELEASE},{headers:{'Cache-Control':'no-store'}});
    }
    return new Response('Not found',{status:404});
  },
  async scheduled(event,env) {
    // Reports continue even when sending is stopped. No Telegram or secret access.
    await env.SENDER.getByName('charter-primary-account').createReport(Math.floor(event.scheduledTime/HOUR)*HOUR);
  },
};
