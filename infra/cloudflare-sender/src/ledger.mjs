// All times are UTC epoch milliseconds. This module never opens a network connection.
import {nextCadenceAt} from './cadence.mjs';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const statuses = new Set(['pending', 'sent', 'sent_external', 'failed', 'uncertain', 'cancelled']);
const positive = x => Number.isSafeInteger(x) && x > 0;

export function validateGroup(g) {
  if (!Number.isSafeInteger(g.chat_id) || g.chat_id >= 0 || typeof g.handle !== 'string') throw Error('invalid_peer');
  if (typeof g.enabled !== 'boolean' || typeof g.paid !== 'boolean') throw Error('invalid_flags');
  if (!positive(g.interval_ms) || !Number.isSafeInteger(g.slowmode_ms) || g.slowmode_ms < 0) throw Error('invalid_interval');
  if (g.verified !== true || !g.evidence || !['free', 'approved'].includes(g.permission)) throw Error('unverified_permission');
  if (!positive(g.valid_until) || !positive(g.daily_limit)) throw Error('missing_policy_limit');
  if (g.day_basis !== 'rolling_24h') throw Error('calendar_policy_requires_adapter');
  if (!positive(g.max_chars) || !positive(g.max_lines) || typeof g.allow_links !== 'boolean') throw Error('invalid_content_policy');
  if (!['photo', 'text'].includes(g.format) || typeof g.text !== 'string' || !g.text.trim()) throw Error('invalid_content');
  if (g.text.length > Math.min(g.max_chars, g.format === 'photo' ? 1024 : 4096) || g.text.split('\n').length > g.max_lines) throw Error('content_too_long');
  if (!g.allow_links && /(?:https?:\/\/|tg:\/\/|www\.|t\.me\/|@[a-z\d_]{3,}|\b[a-z\d-]+\.(?:com|ru|pro|net|org)\b)/i.test(g.text)) throw Error('links_not_allowed');
  if (!/^[a-f0-9]{64}$/.test(g.digest || '')) throw Error('content_digest_missing');
  if (g.format === 'photo' && (!/^[a-f0-9]{64}$/.test(g.photo_sha256 || '') || !/^\/[a-zA-Z0-9/_.-]+$/.test(g.photo_asset || '') || g.photo_asset.includes('..'))) throw Error('invalid_photo');
  if (g.paid && (g.format !== 'photo' || !positive(g.paid_until) || g.payment_confirmed !== true || g.recurring_confirmed !== true)) throw Error('paid_terms_missing');
  if (!Number.isSafeInteger(g.gap_ms) || g.gap_ms < 0) throw Error('invalid_gap');
  if (g.wait_until!=null && (!Number.isSafeInteger(g.wait_until) || g.wait_until<0)) throw Error('invalid_group_wait');
  if (g.refresh_on_live_check!=null && typeof g.refresh_on_live_check!=='boolean') throw Error('invalid_refresh');
  if (g.paid && g.refresh_on_live_check) throw Error('paid_refresh_forbidden');
  if (g.entities && (!Array.isArray(g.entities) || g.entities.some(e=>e.type!=='bold' || !Number.isSafeInteger(e.offset) || !positive(e.length) || e.offset<0 || e.offset+e.length>g.text.length))) throw Error('invalid_entities');
}

export function policyBlock(g, now) {
  if (!g.enabled) return 'disabled';
  if (g.valid_until <= now && !(g.refresh_on_live_check && !g.paid)) return 'rules_expired';
  if (g.paid && g.paid_until <= now) return 'paid_expired';
  return null;
}

export class Ledger {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS control(id INTEGER PRIMARY KEY CHECK(id=1), initialized INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0, halt TEXT NOT NULL DEFAULT '',
        wait_until INTEGER NOT NULL DEFAULT 0, daily_limit INTEGER NOT NULL DEFAULT 1, gap_ms INTEGER NOT NULL DEFAULT 0,
        expected_user_id TEXT NOT NULL DEFAULT '', report_start INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO control(id) VALUES(1);
      CREATE TABLE IF NOT EXISTS groups(chat_id INTEGER PRIMARY KEY, spec TEXT NOT NULL, due_at INTEGER NOT NULL,
        blocked TEXT NOT NULL DEFAULT '', wait_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, created INTEGER NOT NULL,
        status TEXT NOT NULL, digest TEXT NOT NULL, message_id TEXT, error TEXT NOT NULL DEFAULT '',
        epoch INTEGER NOT NULL, random_id TEXT NOT NULL, segment TEXT NOT NULL DEFAULT 'unknown');
      CREATE INDEX IF NOT EXISTS attempts_chat_created ON attempts(chat_id,created);
      CREATE INDEX IF NOT EXISTS attempts_status ON attempts(status);
      CREATE INDEX IF NOT EXISTS attempts_chat_status ON attempts(chat_id,status);
      CREATE INDEX IF NOT EXISTS attempts_created ON attempts(created);
      CREATE TABLE IF NOT EXISTS reports(hour INTEGER PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready');
      CREATE TABLE IF NOT EXISTS blocked(chat_id INTEGER PRIMARY KEY,reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage(scope INTEGER NOT NULL,bucket INTEGER NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(scope,bucket));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imported_attempts(id TEXT PRIMARY KEY,original TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,created INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS status_totals(status TEXT PRIMARY KEY,n INTEGER NOT NULL);
    `);
    if(!this.rows('PRAGMA table_info(attempts)').some(x=>x.name==='segment'))this.sql.exec("ALTER TABLE attempts ADD COLUMN segment TEXT NOT NULL DEFAULT 'unknown'");
    if(!this.meta('totals_initialized'))this.storage.transactionSync(()=>{
      this.sql.exec('INSERT INTO status_totals SELECT status,COUNT(*) FROM attempts GROUP BY status');
      this.setMeta('totals_initialized',true);
    });
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  control() { return this.rows('SELECT * FROM control WHERE id=1')[0]; }
  meta(key) {const r=this.rows('SELECT value FROM meta WHERE key=?',key)[0];return r?JSON.parse(r.value):null;}
  setMeta(key,value) {this.sql.exec('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
  counts(query, ...args) { return Object.fromEntries(this.rows(query, ...args).map(x => [x.status, x.n])); }
  transition(from,to,n=1) {
    if(from===to)return;
    if(from)this.sql.exec('UPDATE status_totals SET n=n-? WHERE status=?',n,from);
    if(to)this.sql.exec('INSERT INTO status_totals VALUES(?,?) ON CONFLICT(status) DO UPDATE SET n=n+excluded.n',to,n);
  }
  pending() { return this.rows("SELECT id FROM attempts WHERE status='pending' LIMIT 1").length > 0; }
  importSnapshot(snapshot, now) {
    if (this.control().initialized) throw Error('already_initialized');
    if (snapshot.version !== 1 || !Array.isArray(snapshot.groups) || snapshot.groups.length > 100 || !Array.isArray(snapshot.attempts)) throw Error('invalid_snapshot');
    if (!positive(snapshot.daily_limit) || !Number.isSafeInteger(snapshot.gap_ms) || snapshot.gap_ms < 0 || !/^[1-9]\d*$/.test(snapshot.expected_user_id)) throw Error('invalid_control');
    for (const g of snapshot.groups) validateGroup(g);
    const ids = new Set(snapshot.groups.map(g => g.chat_id));
    if (ids.size !== snapshot.groups.length) throw Error('duplicate_group');
    for (const a of snapshot.attempts) {
      if (typeof a.id !== 'string' || !a.id || !Number.isSafeInteger(a.chat_id) || !positive(a.created) || a.created>now || !statuses.has(a.status) || typeof a.digest !== 'string') throw Error('invalid_attempt');
    }
    if (!Array.isArray(snapshot.blocked) || snapshot.blocked.some(b => !Number.isSafeInteger(b.chat_id) || typeof b.reason !== 'string')) throw Error('invalid_blocked');
    if (!Number.isSafeInteger(snapshot.wait_until) || snapshot.wait_until < 0 || typeof snapshot.halt !== 'string') throw Error('invalid_hold');
    if (snapshot.expected_username!=null && !/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(snapshot.expected_username)) throw Error('invalid_username');
    this.storage.transactionSync(() => {
      for (const g of snapshot.groups) this.sql.exec('INSERT INTO groups(chat_id,spec,due_at,wait_until) VALUES(?,?,?,?)',g.chat_id,JSON.stringify(g),now,g.wait_until || 0);
      for (const a of snapshot.attempts) {
        this.sql.exec('INSERT INTO attempts(id,chat_id,created,status,digest,message_id,error,epoch,random_id,segment) VALUES(?,?,?,?,?,?,?,?,?,?)',a.id,a.chat_id,a.created,a.status,a.digest,a.message_id == null ? null : String(a.message_id),a.error || '',0,a.random_id || '',['paid','free'].includes(a.segment)?a.segment:'unknown');
        this.recordUsage(a.chat_id,a.created);
        this.transition(null,a.status);
        this.sql.exec('INSERT INTO imported_attempts VALUES(?,?)',a.id,JSON.stringify(a));
      }
      for (const b of snapshot.blocked) this.sql.exec('INSERT INTO blocked VALUES(?,?)',b.chat_id,b.reason || 'imported_hold');
      this.sql.exec('UPDATE control SET initialized=1,enabled=0,epoch=1,halt=?,wait_until=?,daily_limit=?,gap_ms=?,expected_user_id=?,report_start=? WHERE id=1',snapshot.halt,snapshot.wait_until,snapshot.daily_limit,snapshot.gap_ms,snapshot.expected_user_id,Math.floor(now / HOUR) * HOUR);
      this.setMeta('expected_username',snapshot.expected_username || '');
      this.setMeta('source',snapshot.source || {});
      this.setMeta('last_report_end',Math.floor(now/HOUR)*HOUR);
      this.setMeta('last_paid_report_end',Math.floor(now/HOUR)*HOUR);
      for (const g of snapshot.groups) {
        const last=this.rows('SELECT MAX(created) AS t FROM attempts WHERE chat_id=?',g.chat_id)[0].t;
        // The exact acknowledgement time of imported Python records is unknown.
        // One cooldown from snapshot time is a conservative cutover boundary.
        this.sql.exec('UPDATE groups SET due_at=? WHERE chat_id=?',snapshot.source?.final?this.nextDue(g,Math.max(last || 0,now),now+1):this.nextDue(g,last,now),g.chat_id);
      }
    });
  }
  interval(g) { return Math.max(g.paid ? 300_000 : 600_000,g.interval_ms,g.slowmode_ms); }
  nextDue(g,last,now){return nextCadenceAt(g,last,now);}
  recordUsage(chatId,now) {
    const bucket=Math.floor(now/HOUR)*HOUR;
    for (const scope of [0,chatId]) this.sql.exec('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET n=n+1',scope,bucket);
  }
  used(scope,now) {
    const start=now-DAY,boundary=(Math.floor(start/HOUR)+1)*HOUR;
    const whole=this.rows('SELECT COALESCE(SUM(n),0) AS n FROM usage WHERE scope=? AND bucket>=?',scope,boundary)[0].n;
    const edge=scope===0?this.rows('SELECT COUNT(*) AS n FROM attempts WHERE created>? AND created<?',start,boundary)[0].n:
      this.rows('SELECT COUNT(*) AS n FROM attempts WHERE chat_id=? AND created>? AND created<?',scope,start,boundary)[0].n;
    return whole+edge;
  }
  recover() {
    if (!this.pending()) return;
    this.storage.transactionSync(() => {
      const n=this.rows("SELECT COUNT(*) AS n FROM attempts WHERE status='pending'")[0].n;
      this.sql.exec("UPDATE attempts SET status='uncertain',error='interrupted_process' WHERE status='pending'");
      this.transition('pending','uncertain',n);
      this.sql.exec("UPDATE control SET enabled=0,epoch=epoch+1,halt='interrupted_delivery_requires_review' WHERE id=1");
    });
  }
  stop() { this.sql.exec('UPDATE control SET enabled=0,epoch=epoch+1 WHERE id=1'); }
  activate() {
    const c=this.control();
    if (!c.initialized || c.halt || this.pending()) throw Error('activation_blocked');
    this.sql.exec('UPDATE control SET enabled=1,epoch=epoch+1 WHERE id=1');
  }
  claim(now, id, randomId) {
    return this.storage.transactionSync(() => {
      const c=this.control();
      if (!c.enabled || c.halt || c.wait_until>now || this.pending()) return null;
      if (this.used(0,now)>=c.daily_limit) return null;
      const last=this.rows('SELECT MAX(created) AS last FROM attempts')[0].last;
      for (const row of this.rows('SELECT * FROM groups WHERE due_at<=? ORDER BY due_at,chat_id',now)) {
        const g=JSON.parse(row.spec);
        if (row.blocked || row.wait_until>now || policyBlock(g,now) || this.rows('SELECT chat_id FROM blocked WHERE chat_id=?',g.chat_id).length) continue;
        if (this.rows("SELECT id FROM attempts WHERE chat_id=? AND status IN ('pending','uncertain') LIMIT 1",g.chat_id).length) continue;
        if (last!=null && now<last+Math.max(c.gap_ms,g.gap_ms)) continue;
        const previous=this.rows('SELECT MAX(created) AS t FROM attempts WHERE chat_id=?',g.chat_id)[0].t;
        const allowedAt=this.nextDue(g,previous,now);
        if(allowedAt>now){this.sql.exec('UPDATE groups SET due_at=MAX(due_at,?) WHERE chat_id=?',allowedAt,g.chat_id);continue;}
        const used=this.used(g.chat_id,now);
        if (used>=g.daily_limit) {
          const oldest=this.rows('SELECT MIN(created) AS t FROM attempts WHERE chat_id=? AND created>?',g.chat_id,now-DAY)[0].t;
          this.sql.exec('UPDATE groups SET due_at=MAX(due_at,?) WHERE chat_id=?',oldest+DAY+1,g.chat_id);
          continue;
        }
        this.sql.exec("INSERT INTO attempts(id,chat_id,created,status,digest,message_id,error,epoch,random_id,segment) VALUES(?,?,?,'pending',?,NULL,'',?,?,?)",id,g.chat_id,now,g.digest,c.epoch,randomId,g.paid?'paid':'free');
        this.transition(null,'pending');
        this.recordUsage(g.chat_id,now);
        this.sql.exec('UPDATE groups SET due_at=? WHERE chat_id=?',this.nextDue(g,now,now+1),g.chat_id);
        return {id,group:g,epoch:c.epoch,random_id:randomId,expected_user_id:c.expected_user_id,expected_username:this.meta('expected_username')};
      }
      return null;
    });
  }
  validClaim(job,now) {
    const c=this.control();
    const a=this.rows('SELECT status,epoch FROM attempts WHERE id=?',job.id)[0];
    const g=this.rows('SELECT * FROM groups WHERE chat_id=?',job.group.chat_id)[0];
    return !!(c.enabled && !c.halt && c.epoch===job.epoch && c.wait_until<=now && a?.status==='pending' && a.epoch===job.epoch && g && !g.blocked && g.wait_until<=now && !this.rows('SELECT chat_id FROM blocked WHERE chat_id=?',g.chat_id).length && !policyBlock(JSON.parse(g.spec),now));
  }
  finish(job,result,now) {
    this.storage.transactionSync(() => {
      if (this.rows('SELECT status FROM attempts WHERE id=?',job.id)[0]?.status!=='pending') return;
      const kind=result?.kind;
      const accepted=kind==='sent' && /^[1-9]\d*$/.test(String(result.message_id));
      const known=['cancelled','skipped','blocked','flood','slowmode','preflight_failed','account_halt'].includes(kind);
      const status=accepted?'sent':['cancelled','skipped'].includes(kind)?'cancelled':known?'failed':'uncertain';
      const reason=kind==='skipped' && ['last_message_ours','last_message_unreadable'].includes(result.reason)?result.reason:kind;
      this.sql.exec('UPDATE attempts SET status=?,message_id=?,error=? WHERE id=?',status,accepted?String(result.message_id):null,accepted?'':reason || 'unknown_result',job.id);
      this.transition('pending',status);
      if(accepted)this.sql.exec('UPDATE groups SET due_at=MAX(due_at,?) WHERE chat_id=?',this.nextDue(job.group,now,now+1),job.group.chat_id);
      if (kind==='blocked') this.sql.exec("INSERT OR REPLACE INTO blocked VALUES(?,'live_policy_block')",job.group.chat_id);
      if (kind==='account_halt') this.sql.exec("UPDATE control SET enabled=0,halt='account_requires_review' WHERE id=1");
      if (kind==='flood' || kind==='slowmode') {
        if (!positive(result.retry_after_ms)) {
          this.sql.exec("UPDATE control SET enabled=0,halt='invalid_wait' WHERE id=1");
        } else if (kind==='flood') this.sql.exec('UPDATE control SET wait_until=MAX(wait_until,?) WHERE id=1',now+result.retry_after_ms);
        else this.sql.exec('UPDATE groups SET wait_until=MAX(wait_until,?) WHERE chat_id=?',now+result.retry_after_ms,job.group.chat_id);
      }
      if (status==='uncertain') this.sql.exec("UPDATE control SET enabled=0,halt='uncertain_delivery_requires_review' WHERE id=1");
    });
  }
  nextWake(now) {
    const c=this.control();
    if (!c.enabled || c.halt) return null;
    if (this.pending()) return now+120_000;
    let globalDue=Math.max(now+1000,c.wait_until);
    const last=this.rows('SELECT MAX(created) AS t FROM attempts')[0].t;
    if (this.used(0,now)>=c.daily_limit) {
      const oldest=this.rows('SELECT MIN(created) AS t FROM attempts WHERE created>?',now-DAY)[0].t;
      globalDue=Math.max(globalDue,oldest+DAY+1);
    }
    const due=[];
    for (const row of this.rows('SELECT * FROM groups')) {
      const g=JSON.parse(row.spec);
      if (row.blocked || policyBlock(g,now) || this.rows('SELECT chat_id FROM blocked WHERE chat_id=?',g.chat_id).length ||
          this.rows("SELECT id FROM attempts WHERE chat_id=? AND status IN ('pending','uncertain') LIMIT 1",g.chat_id).length) continue;
      let next=Math.max(globalDue,row.due_at,row.wait_until,(last || 0)+Math.max(c.gap_ms,g.gap_ms));
      // claim() checks the daily ceiling when a group is due and persists its
      // next quota-release time. Avoid rescanning every group's daily usage here.
      if((g.refresh_on_live_check && !g.paid || next<g.valid_until) && (!g.paid || next<g.paid_until))due.push(next);
    }
    return due.length?Math.min(...due):null;
  }
  hourly(end) {
    if (end%HOUR) throw Error('invalid_report_boundary');
    const c=this.control();
    const report={start:end-HOUR,end,generated_at:Date.now(),attempts:this.counts('SELECT status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? GROUP BY status',end-HOUR,end),
      free:this.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? AND segment='free' GROUP BY status",end-HOUR,end),
      unclassified:this.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? AND segment='unknown' GROUP BY status",end-HOUR,end),
      unresolved_now:this.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE status IN ('pending','uncertain') GROUP BY status"),
      groups:this.rows('SELECT chat_id,status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? GROUP BY chat_id,status',end-HOUR,end),
      enabled:!!c.enabled,halt:c.halt,wait_until:c.wait_until,blocked_groups:this.rows('SELECT COUNT(*) AS n FROM blocked')[0].n,
      note:'sent is an API acknowledgement, not proof of visibility; no attempts is not proof of health'};
    const paidStart=this.meta('last_paid_report_end')??this.control().report_start;
    if(end>=paidStart+5*HOUR){
      report.paid_window={start:paidStart,end,attempts:this.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? AND segment='paid' GROUP BY status",paidStart,end)};
      this.setMeta('last_paid_report_end',end);
    }
    this.sql.exec('INSERT OR IGNORE INTO reports(hour,body) VALUES(?,?)',end,JSON.stringify(report));
    return JSON.parse(this.rows('SELECT body FROM reports WHERE hour=?',end)[0].body);
  }
  reportsDue(end) {
    if(end%HOUR)throw Error('invalid_report_boundary');
    if(!this.control().initialized)return [];
    const start=this.meta('last_report_end')??this.control().report_start;
    const due=[];
    // Bounded catch-up. Persist a cursor so a long outage cannot create an unbounded invocation.
    for(let hour=start+HOUR;hour<=end && due.length<24;hour+=HOUR) {
      due.push(this.hourly(hour));this.setMeta('last_report_end',hour);
    }
    return due;
  }
  reportQueue() {return this.rows("SELECT hour,body,state FROM reports WHERE state NOT IN ('sent','uncertain','failed') ORDER BY hour LIMIT 24");}
  reportState(hour,state) {
    if(!['ready','pending','sent','uncertain','failed','blocked'].includes(state))throw Error('invalid_report_state');
    this.sql.exec('UPDATE reports SET state=? WHERE hour=?',state,hour);
  }
  exportSnapshot() {
    if(this.control().enabled)throw Error('stop_before_export');
    return {version:1,control:this.control(),groups:this.rows('SELECT * FROM groups'),
      attempts:this.rows('SELECT * FROM attempts ORDER BY created,id'),blocked:this.rows('SELECT * FROM blocked'),
      imported_attempts:this.rows('SELECT * FROM imported_attempts'),reports:this.rows('SELECT * FROM reports ORDER BY hour'),
      reviews:this.rows('SELECT * FROM reviews'),source:this.meta('source')};
  }
  reviewAttempt(input,now) {
    const c=this.control();
    if(c.enabled || typeof input.evidence!=='string' || input.evidence.trim().length<10 || input.evidence.length>2000)throw Error('review_requires_stop_and_evidence');
    const a=this.rows('SELECT * FROM attempts WHERE id=?',input.id)[0];
    if(!a || !['uncertain','pending'].includes(a.status))throw Error('attempt_not_unresolved');
    if(!['confirmed_sent','confirmed_not_sent','keep_hold'].includes(input.decision))throw Error('invalid_decision');
    if(input.decision==='confirmed_sent' && !/^[1-9]\d*$/.test(String(input.message_id)))throw Error('message_id_required');
    this.storage.transactionSync(()=>{
      this.sql.exec('INSERT INTO reviews VALUES(?,?,?)',crypto.randomUUID(),now,JSON.stringify({before:a,...input}));
      if(input.decision!=='keep_hold')this.sql.exec('UPDATE attempts SET status=?,message_id=?,error=? WHERE id=?',input.decision==='confirmed_sent'?'sent':'failed',input.decision==='confirmed_sent'?String(input.message_id):null,'manual_review',a.id);
      else this.sql.exec("UPDATE attempts SET status='uncertain' WHERE id=?",a.id);
      this.transition(a.status,input.decision==='confirmed_sent'?'sent':input.decision==='confirmed_not_sent'?'failed':'uncertain');
      // A review never unblocks a peer or replays the old intent.
      this.sql.exec("INSERT OR IGNORE INTO blocked VALUES(?,'manual_review_hold')",a.chat_id);
      const uncovered=this.rows("SELECT a.id FROM attempts a LEFT JOIN blocked b ON b.chat_id=a.chat_id WHERE a.status IN ('pending','uncertain') AND (a.status='pending' OR b.chat_id IS NULL) LIMIT 1");
      if(!uncovered.length && ['uncertain_delivery_requires_review','interrupted_delivery_requires_review'].includes(c.halt))this.sql.exec("UPDATE control SET halt='' WHERE id=1");
    });
    return this.status();
  }
  updateGroup(group,now) {
    if(this.control().enabled || this.pending())throw Error('stop_before_rules_update');
    validateGroup(group);
    if(!this.rows('SELECT chat_id FROM groups WHERE chat_id=?',group.chat_id).length)throw Error('new_group_requires_separate_review');
    this.storage.transactionSync(()=>{
      this.sql.exec('INSERT INTO reviews VALUES(?,?,?)',crypto.randomUUID(),now,JSON.stringify({kind:'rules',group}));
      this.sql.exec('UPDATE groups SET spec=?,due_at=MAX(due_at,?),wait_until=MAX(wait_until,?) WHERE chat_id=?',JSON.stringify(group),now,group.wait_until || 0,group.chat_id);
      this.sql.exec('UPDATE control SET epoch=epoch+1 WHERE id=1');
    });
    return this.status();
  }
  status() {
    const c=this.control();
    return {initialized:!!c.initialized,enabled:!!c.enabled,halt:c.halt,wait_until:c.wait_until,
      attempts:this.counts('SELECT status,n FROM status_totals WHERE n>0'),
      group_count:this.rows('SELECT COUNT(*) AS n FROM groups')[0].n,
      blocked_groups:this.rows('SELECT COUNT(*) AS n FROM blocked')[0].n,
      reports:this.rows('SELECT hour,state FROM reports ORDER BY hour DESC LIMIT 24')};
  }
}
