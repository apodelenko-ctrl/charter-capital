// All times are UTC epoch milliseconds. This module never opens a network connection.
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
  if (!g.allow_links && /(?:https?:\/\/|www\.|t\.me\/|@[a-z\d_]{3,}|\b[a-z\d-]+\.(?:com|ru|pro|net|org)\b)/i.test(g.text)) throw Error('links_not_allowed');
  if (!/^[a-f0-9]{64}$/.test(g.digest || '')) throw Error('content_digest_missing');
  if (g.format === 'photo' && (!/^[a-f0-9]{64}$/.test(g.photo_sha256 || '') || !/^\/[a-zA-Z0-9/_.-]+$/.test(g.photo_asset || '') || g.photo_asset.includes('..'))) throw Error('invalid_photo');
  if (g.paid && (g.format !== 'photo' || !positive(g.paid_until) || g.payment_confirmed !== true || g.recurring_confirmed !== true)) throw Error('paid_terms_missing');
  if (!Number.isSafeInteger(g.gap_ms) || g.gap_ms < 0) throw Error('invalid_gap');
  if (g.wait_until!=null && (!Number.isSafeInteger(g.wait_until) || g.wait_until<0)) throw Error('invalid_group_wait');
}

export function policyBlock(g, now) {
  if (!g.enabled) return 'disabled';
  if (g.valid_until <= now) return 'rules_expired';
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
        epoch INTEGER NOT NULL, random_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_chat_created ON attempts(chat_id,created);
      CREATE INDEX IF NOT EXISTS attempts_status ON attempts(status);
      CREATE INDEX IF NOT EXISTS attempts_created ON attempts(created);
      CREATE TABLE IF NOT EXISTS reports(hour INTEGER PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready');
      CREATE TABLE IF NOT EXISTS blocked(chat_id INTEGER PRIMARY KEY,reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage(scope INTEGER NOT NULL,bucket INTEGER NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(scope,bucket));
    `);
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  control() { return this.rows('SELECT * FROM control WHERE id=1')[0]; }
  counts(query, ...args) { return Object.fromEntries(this.rows(query, ...args).map(x => [x.status, x.n])); }
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
    this.storage.transactionSync(() => {
      for (const g of snapshot.groups) this.sql.exec('INSERT INTO groups(chat_id,spec,due_at,wait_until) VALUES(?,?,?,?)',g.chat_id,JSON.stringify(g),now,g.wait_until || 0);
      for (const a of snapshot.attempts) {
        this.sql.exec('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',a.id,a.chat_id,a.created,a.status,a.digest,a.message_id == null ? null : String(a.message_id),a.error || '',0,a.random_id || '');
        this.recordUsage(a.chat_id,a.created);
      }
      for (const b of snapshot.blocked) this.sql.exec('INSERT INTO blocked VALUES(?,?)',b.chat_id,b.reason || 'imported_hold');
      this.sql.exec('UPDATE control SET initialized=1,enabled=0,epoch=1,halt=?,wait_until=?,daily_limit=?,gap_ms=?,expected_user_id=?,report_start=? WHERE id=1',snapshot.halt,snapshot.wait_until,snapshot.daily_limit,snapshot.gap_ms,snapshot.expected_user_id,Math.floor(now / HOUR) * HOUR);
      for (const g of snapshot.groups) {
        const last=this.rows('SELECT MAX(created) AS t FROM attempts WHERE chat_id=?',g.chat_id)[0].t;
        if (last != null) this.sql.exec('UPDATE groups SET due_at=? WHERE chat_id=?',Math.max(now,last+this.interval(g)),g.chat_id);
      }
    });
  }
  interval(g) { return Math.max(g.paid ? 300_000 : 600_000,g.interval_ms,g.slowmode_ms); }
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
      this.sql.exec("UPDATE attempts SET status='uncertain',error='interrupted_process' WHERE status='pending'");
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
        const used=this.used(g.chat_id,now);
        if (used>=g.daily_limit) continue;
        this.sql.exec("INSERT INTO attempts VALUES(?,?,?,'pending',?,NULL,'',?,?)",id,g.chat_id,now,g.digest,c.epoch,randomId);
        this.recordUsage(g.chat_id,now);
        this.sql.exec('UPDATE groups SET due_at=? WHERE chat_id=?',now+this.interval(g),g.chat_id);
        return {id,group:g,epoch:c.epoch,random_id:randomId,expected_user_id:c.expected_user_id};
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
      const known=['cancelled','blocked','flood','slowmode','preflight_failed'].includes(kind);
      const status=accepted?'sent':kind==='cancelled'?'cancelled':known?'failed':'uncertain';
      this.sql.exec('UPDATE attempts SET status=?,message_id=?,error=? WHERE id=?',status,accepted?String(result.message_id):null,accepted?'':kind || 'unknown_result',job.id);
      if (kind==='blocked') this.sql.exec("INSERT OR REPLACE INTO blocked VALUES(?,'live_policy_block')",job.group.chat_id);
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
      if (this.used(g.chat_id,now)>=g.daily_limit) {
        const oldest=this.rows('SELECT MIN(created) AS t FROM attempts WHERE chat_id=? AND created>?',g.chat_id,now-DAY)[0].t;
        next=Math.max(next,oldest+DAY+1);
      }
      if(next<g.valid_until && (!g.paid || next<g.paid_until))due.push(next);
    }
    return due.length?Math.min(...due):null;
  }
  hourly(end) {
    if (end%HOUR) throw Error('invalid_report_boundary');
    const c=this.control();
    const report={start:end-HOUR,end,generated_at:Date.now(),attempts:this.counts('SELECT status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? GROUP BY status',end-HOUR,end),
      unresolved_now:this.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE status IN ('pending','uncertain') GROUP BY status"),
      groups:this.rows('SELECT chat_id,status,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? GROUP BY chat_id,status',end-HOUR,end),
      enabled:!!c.enabled,halt:c.halt,wait_until:c.wait_until,
      note:'sent is an API acknowledgement, not proof of visibility; no attempts is not proof of health'};
    this.sql.exec('INSERT OR IGNORE INTO reports(hour,body) VALUES(?,?)',end,JSON.stringify(report));
    return JSON.parse(this.rows('SELECT body FROM reports WHERE hour=?',end)[0].body);
  }
  status() {
    const c=this.control();
    return {initialized:!!c.initialized,enabled:!!c.enabled,halt:c.halt,wait_until:c.wait_until,
      attempts:this.counts('SELECT status,COUNT(*) AS n FROM attempts GROUP BY status'),
      group_count:this.rows('SELECT COUNT(*) AS n FROM groups')[0].n,
      blocked_groups:this.rows('SELECT COUNT(*) AS n FROM blocked')[0].n,
      reports:this.rows('SELECT hour,state FROM reports ORDER BY hour DESC LIMIT 24')};
  }
}
