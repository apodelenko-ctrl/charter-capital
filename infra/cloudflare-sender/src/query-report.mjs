// Synchronous SELECTs only: no Telegram calls, report queue, scheduling or repairs.
import {policyBlock,DAY} from './ledger.mjs';
import {ReportQueryError,validateReportQuery,MAX_REPORT_RECORDS} from './report-query-input.mjs';
import {ORIGINAL_PAID_IDS} from './report-scope.mjs';
const STATUS=['pending','sent','sent_external','failed','uncertain','cancelled'];
const VISIBILITY=['pending','verified','quarantined','not_recorded'];
const CODES=new Set([
  'cancelled','skipped','blocked','flood','slowmode','preflight_failed','account_halt',
  'last_message_ours','last_message_unreadable','unknown_result','uncertain',
  'interrupted_preflight','interrupted_process','visibility_mismatch','verification_unavailable',
  'verification_system_error','unknown_verification','live_policy_block','imported_hold',
  'rotation_delivery_requires_review','account_requires_review','invalid_wait',
  'uncertain_delivery_requires_review','interrupted_delivery_requires_review','visibility_requires_review',
  'FloodWaitError','SlowModeWaitError','ChatWriteForbiddenError','ChatRestrictedError',
  'UserBannedInChannelError','PeerFloodError','ChannelPrivateError','ChatAdminRequiredError',
  'MessageTooLongError','ChatSendMediaForbiddenError','ChatSendPlainForbiddenError',
  'ChatSendPhotosForbiddenError','TimeoutError','RPCError','ConnectionError','EmptySendResult','InterdcCallErrorError',
]);
const iso=ms=>Number.isFinite(ms) && ms>0?new Date(ms).toISOString():null;
const parse=value=>value?JSON.parse(value):null;
const handle=value=>typeof value==='string' && /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(value.replace(/^@/,''))?value.replace(/^@/,''):null;
const format=value=>['photo','text'].includes(value)?value:'unknown';
function code(value){
  if(!value)return null;
  const first=String(value).split(/[:;]/)[0];
  if(CODES.has(first))return first;
  if(/^visibility_pending_/.test(value))return 'visibility_pending';
  if(/^delivery_quarantine_/.test(value))return 'delivery_quarantine';
  return 'unclassified_redacted';
}
const bump=(object,key)=>{object[key]=(object[key] || 0)+1;};
const counts=keys=>Object.fromEntries(keys.map(k=>[k,0]));
function totals(records){
  const result={ledger_records:records.length,submitted_attempts:0,pre_submission_checks:0,pre_submission_skips:0,
    status:counts(STATUS),submitted_status:counts(STATUS),visibility:counts(VISIBILITY),
    api_acknowledged:0,externally_confirmed:0,known_publications:0,verified_publications:0,
    groups_attempted:0,groups_with_publications:0,groups_with_verified_publications:0,
    publication_formats:{photo:0,text:0,unknown:0},submitted_errors:{},check_errors:{}};
  const attempted=new Set(),published=new Set(),verified=new Set();
  for(const a of records){
    bump(result.status,a.status);
    if(a.submitted){result.submitted_attempts++;bump(result.submitted_status,a.status);attempted.add(a.chat_id);}
    else {result.pre_submission_checks++;if(['failed','cancelled'].includes(a.status))result.pre_submission_skips++;}
    if(a.error_code && !a.publication)bump(a.submitted?result.submitted_errors:result.check_errors,a.error_code);
    if(a.publication){
      result.known_publications++;published.add(a.chat_id);
      if(a.status==='sent')result.api_acknowledged++;else result.externally_confirmed++;
      bump(result.publication_formats,a.recorded_format);bump(result.visibility,a.visibility.state);
      if(a.visibility.state==='verified'){result.verified_publications++;verified.add(a.chat_id);}
    }
  }
  result.groups_attempted=attempted.size;result.groups_with_publications=published.size;
  result.groups_with_verified_publications=verified.size;return result;
}
function membership(registry,ids){
  const result={registry_entries:0,joined:0,approval_pending:0,not_confirmed_joined:0,unknown:0,left_flagged:0};
  for(const [id,row] of Object.entries(registry)){
    if(ids && !ids.has(Number(id)))continue;
    result.registry_entries++;
    bump(result,['joined','approval_pending','not_confirmed_joined'].includes(row.membership)?row.membership:'unknown');
    if(row.left===true)result.left_flagged++;
  }
  return result;
}
function links(chatId,messageId,username){
  if(!/^[1-9]\d*$/.test(String(messageId || '')))return {member_link:null,public_link:null};
  const channel=String(chatId).match(/^-100([1-9]\d*)$/)?.[1];
  return {member_link:channel?`https://t.me/c/${channel}/${messageId}`:null,
    public_link:username?`https://t.me/${username}/${messageId}`:null};
}

export function queryReport(ledger,input,now=Date.now(),paidIds=ORIGINAL_PAID_IDS){
  const {scope,start,end}=validateReportQuery(input,now);
  if(!ledger.control().initialized)throw new ReportQueryError('ledger_not_initialized',503);
  if(scope==='paid' && (!Array.isArray(paidIds) || paidIds.length!==8 || new Set(paidIds).size!==8 || paidIds.some(id=>!Number.isSafeInteger(id) || id>=0)))throw new ReportQueryError('paid_scope_not_configured',503);
  const filter=scope==='free'?"a.segment='free'":`a.chat_id IN (${paidIds.map(()=>'?').join(',')})`;
  const parameters=scope==='free'?[start,end]:[start,end,...paidIds];
  const count=ledger.rows(`SELECT COUNT(*) AS n FROM attempts a WHERE a.created>=? AND a.created<? AND ${filter}`,...parameters)[0].n;
  if(count>MAX_REPORT_RECORDS)throw new ReportQueryError('too_many_records_split_window',413);
  const rows=ledger.rows(`SELECT a.id,a.chat_id,a.created,a.status,a.message_id,a.error,a.segment,a.submitted,
    v.spec AS delivery_spec,v.state AS visibility,v.checked_at,v.reason AS visibility_reason,
    p.variant,p.confirmed FROM attempts a LEFT JOIN visibility v ON v.attempt_id=a.id
    LEFT JOIN paid_variants p ON p.attempt_id=a.id
    WHERE a.created>=? AND a.created<? AND ${filter} ORDER BY a.created,a.id`,...parameters);
  const current=ledger.rows('SELECT * FROM groups').map(r=>({...r,group:parse(r.spec)}));
  const rules=new Map(current.map(r=>[r.chat_id,r]));
  const source=ledger.meta('source');
  const sourceUtc=typeof source?.exported_at==='number'?iso(source.exported_at):null;
  // Deliberate whitelist: never load config, identity, content archives or credentials.
  const registry=parse(ledger.rows("SELECT body FROM source_files WHERE path='group-registry.json'")[0]?.body) || {};
  const records=rows.map(a=>{
    const delivery=parse(a.delivery_spec),username=handle(delivery?.handle || rules.get(a.chat_id)?.group.handle || registry[a.chat_id]?.handle);
    const publication=['sent','sent_external'].includes(a.status);
    return {id:a.id,chat_id:a.chat_id,created_utc:iso(a.created),status:a.status,stored_segment:a.segment,
      submitted:a.submitted===1,publication,message_id:a.message_id || null,handle:username,
      handle_source:handle(delivery?.handle)?'delivery_record':username?'current_rule_or_imported_registry':'unknown',
      recorded_format:format(delivery?.format),format_source:delivery?'delivery_record':'unknown',
      variant:['A','B'].includes(a.variant)?a.variant:null,variant_confirmed:a.confirmed===1,
      visibility:{state:VISIBILITY.includes(a.visibility)?a.visibility:'not_recorded',checked_at_utc:iso(a.checked_at),reason_code:code(a.visibility_reason)},
      error_code:code(a.error),...(publication?links(a.chat_id,a.message_id,username):{member_link:null,public_link:null})};
  });
  const scopedIds=scope==='paid'?new Set(paidIds):new Set([
    ...current.filter(r=>r.group.paid===false).map(r=>r.chat_id),...records.map(a=>a.chat_id),
  ]);
  const c=ledger.control(),blocked=new Map(ledger.rows('SELECT * FROM blocked').map(r=>[r.chat_id,r.reason]));
  const outstanding=new Map(ledger.rows("SELECT chat_id,status,COUNT(*) AS n FROM attempts WHERE status IN ('pending','uncertain') GROUP BY chat_id,status").map(r=>[r.chat_id+':'+r.status,r.n]));
  const groups=[...scopedIds].sort((a,b)=>a-b).map(id=>{
    const row=rules.get(id),g=row?.group,holds=[];
    if(!g)holds.push('no_current_rule');
    if(g){
      const policy=policyBlock(g,now);if(policy)holds.push(policy);
      if(row.blocked || blocked.has(id))holds.push('blocked');
      if(row.wait_until>now)holds.push('group_wait');
      if(row.rotation_hold)holds.push('rotation_unconfirmed');
      if(ledger.used(id,now)>=g.daily_limit)holds.push('group_daily_limit');
    }
    if(outstanding.get(id+':pending'))holds.push('pending_delivery');
    if(outstanding.get(id+':uncertain'))holds.push('uncertain_delivery');
    const groupRecords=records.filter(a=>a.chat_id===id);
    return {chat_id:id,handle:handle(g?.handle || registry[id]?.handle),...totals(groupRecords),
      registry_present:Object.hasOwn(registry,id),
      imported_membership:['joined','approval_pending','not_confirmed_joined'].includes(registry[id]?.membership)?registry[id].membership:'unknown',
      current_admission:{has_rule:!!g,rule_enabled:g?.enabled===true,policy_approved:g?policyBlock(g,now)===null:false,
        local_holds:holds,locally_unheld:holds.length===0,live_telegram_permission_checked:false,
        expected_format:g?format(g.format):'unknown',paid_until_utc:iso(g?.paid_until),
        due_at_utc:iso(row?.due_at),group_wait_until_utc:iso(row?.wait_until),blocked_reason:code(row?.blocked || blocked.get(id)),
        unresolved:{pending:outstanding.get(id+':pending') || 0,uncertain:outstanding.get(id+':uncertain') || 0}}};
  });
  const segments=Object.fromEntries(ledger.rows('SELECT segment,COUNT(*) AS n FROM attempts WHERE created>=? AND created<? GROUP BY segment',start,end).map(r=>[r.segment,r.n]));
  const globalUsed=ledger.used(0,now),last=ledger.rows('SELECT MAX(created) AS t FROM attempts WHERE submitted=1')[0].t;
  const earliest=ledger.rows('SELECT MIN(created) AS t FROM attempts')[0].t;
  const report={schema:'charter.window-report.v1',scope,scope_definition:scope==='paid'?'original_eight_chat_ids_regardless_of_stored_segment':'stored_segment_equals_free',
    paid_chat_ids:scope==='paid'?[...paidIds]:undefined,
    window:{start_utc:new Date(start).toISOString(),end_utc:iso(end),bounds:'[start,end)',basis:'attempt_created_utc'},
    generated_at_utc:iso(now),summary:totals(records),groups,records,
    coverage:{complete_for_retained_ledger:true,truncated:false,record_count:count,
      earliest_available_attempt_utc:iso(earliest),source_snapshot_utc:sourceUtc,
      account_window_records_by_stored_segment:segments,
      selected_unknown_segment_records:records.filter(a=>a.stored_segment==='unknown').length,
      unknown_is_never_assigned_to_free:true,
      visibility_basis:'latest_stored_check_at_query_time_for_publications_in_window',
      membership_basis:'imported_registry_snapshot_not_live_telegram',
      admission_basis:'current_rules_and_local_holds_not_historical_or_live_permission',
      skips_basis:'recorded_pre_submission_checks_only_unscheduled_candidates_not_logged'},
    registry:{as_of_utc:sourceUtc,account_base:membership(registry),scope_base:membership(registry,scopedIds),
      scope_classification:scope==='paid'?'original_eight_ids':'current_free_rules_or_free_records_in_requested_window'},
    admissions:{as_of_utc:iso(now),scope_groups:groups.length,with_current_rule:groups.filter(g=>g.current_admission.has_rule).length,
      policy_approved:groups.filter(g=>g.current_admission.policy_approved).length,
      locally_unheld:groups.filter(g=>g.current_admission.locally_unheld).length,
      live_membership_or_permission_refreshed:false},
    shared_account_state:{as_of_utc:iso(now),initialized:!!c.initialized,enabled:!!c.enabled,
      halt_code:code(c.halt),flood_wait_until_utc:iso(c.wait_until),flood_wait_active:c.wait_until>now,
      used_24h:globalUsed,daily_limit:c.daily_limit,daily_limit_reached:globalUsed>=c.daily_limit,
      global_gap_ms:c.gap_ms,earliest_global_gap_end_utc:last?iso(last+c.gap_ms):null,
      unresolved:ledger.counts("SELECT status,COUNT(*) AS n FROM attempts WHERE status IN ('pending','uncertain') GROUP BY status"),
      blocked_groups:blocked.size,registry_groups:Object.keys(registry).length,rule_groups:current.length,
      discovery_enabled:source?.discovery_enabled===true,usage_window_ms:DAY},
  };
  if(new TextEncoder().encode(JSON.stringify(report)).byteLength>16*1024*1024)throw new ReportQueryError('report_too_large_split_window',413);
  return report;
}
