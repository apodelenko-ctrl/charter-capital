// Local only. Detailed inputs/exports stay in the caller's private directory.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeLedger} from '../test/helpers.mjs';
import {policyBlock} from '../src/ledger.mjs';
import {baseInterval,isNight} from '../src/cadence.mjs';
const input=process.argv[2];if(!input)throw Error('private_snapshot_path_required');
const s=JSON.parse(fs.readFileSync(input,'utf8')),now=s.source.exported_at;
const p=spawnSync('python3',['-B',fileURLToPath(new URL('./source_parity.py',import.meta.url)),input],{encoding:'utf8',maxBuffer:16*1024*1024});
if(p.status!==0)throw Error('Mac pure-policy comparison failed: '+p.stderr);
const source=JSON.parse(p.stdout),{ledger:l,db}=makeLedger(s,now);
const allowed=new Set(['candidate_needs_live_check','group_cooldown','group_daily_limit','group_wait']);
const blocked=new Map(s.blocked.map(b=>[b.chat_id,b.reason]));
const uncertain=new Set(s.attempts.filter(a=>['uncertain','pending'].includes(a.status)).map(a=>a.chat_id));
const cloud=s.groups.filter(g=>!policyBlock(g,now) && !uncertain.has(g.chat_id) && (!blocked.has(g.chat_id) || blocked.get(g.chat_id).startsWith('visibility_pending_')));
const expected=Object.entries(source.potential).filter(([,v])=>allowed.has(v)).map(([cid])=>Number(cid)).sort();
assert.deepEqual(cloud.map(g=>g.chat_id).sort(),expected,'recurring scope mismatch');
for(const expected of source.groups){
  const g=s.groups.find(g=>g.chat_id===expected.chat_id);
  assert.equal(g.format,expected.format);assert.equal(g.text,expected.text);assert.equal(g.bold_first_lines,expected.bold_first_lines);
  assert.equal(Math.max(baseInterval(g),g.paid && isNight(now)?1500000:0),expected.interval_ms);
  if(expected.rotation && !expected.rotation.hold){
    const row=l.rows('SELECT rotation_last FROM groups WHERE chat_id=?',g.chat_id)[0],next=row.rotation_last==='A'?'B':'A';
    assert.equal(next,expected.rotation.variant);assert.equal(g.rotation.variants[next].text,expected.rotation.text);
  }
}
assert.equal(l.used(0,now),source.used_24h);
const e=l.exportSnapshot();assert.equal(e.attempts.length,s.attempts.length);assert.deepEqual(e.paid_variants.map(v=>({...v})),s.paid_variants);
const originalFiles=new Map(s.archive.map(f=>[f.path,f]));
for(const f of e.archive){assert.equal(f.body,originalFiles.get(f.path)?.body);assert.equal(createHash('sha256').update(f.body).digest('hex'),f.sha256);}
const output=path.join(path.dirname(input),'offline-cloud-export.json');fs.writeFileSync(output,JSON.stringify(e),{mode:0o600});
const result={verified:true,network_calls:0,source_code_matches:true,normalized_rules:s.groups.length,held_rules:s.source.omitted_rules.length,
  paid_recurring:cloud.filter(g=>g.paid).length,free_recurring:cloud.filter(g=>!g.paid).length,scope_matches:true,formats_and_cadence_match:true,
  exact_attempts:e.attempts.length,exact_paid_variants:e.paid_variants.length,visibility_records:e.visibility.length,exact_archive_files:e.archive.length,
  pending:s.attempts.filter(a=>a.status==='pending').length,uncertain:s.attempts.filter(a=>a.status==='uncertain').length,used_24h:source.used_24h,
  discovery_enabled:false,source_exported_at:new Date(now).toISOString(),snapshot_bytes:fs.statSync(input).size};
console.log(JSON.stringify(result));db.close();
