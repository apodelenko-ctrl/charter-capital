export function validateReport(r) {
  if(!Number.isSafeInteger(r?.end) || r.end%3600000 || r.start!==r.end-3600000 || !r.attempts || !r.unresolved_now || !Array.isArray(r.groups))throw Error('invalid_report');
  for(const counts of [r.attempts,r.unresolved_now])if(Object.values(counts).some(n=>!Number.isSafeInteger(n) || n<0))throw Error('invalid_report_counts');
}
export function formatReport(r) {
  validateReport(r);
  const date=ms=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(ms);
  const line=(segment,label)=>{
    const n=key=>r[segment]?.[key] || 0;
    const visible=(r.visibility || []).find(x=>x.segment===segment && x.state==='verified')?.n || 0;
    const held=(r.visibility || []).filter(x=>x.segment===segment && x.state!=='verified').reduce((n,x)=>n+x.n,0);
    return `${label}: API ${n('sent')}, видимость подтверждена ${visible}, проверка/карантин ${held}, ошибок ${n('failed')}, неопределённых ${n('uncertain')}, внешних ${n('sent_external')}.`;
  };
  return [`Charter Capital · ${date(r.start)} — ${date(r.end)} (Бангкок)`,
    line('paid','Оплаченные за час'),line('free','Бесплатные за час'),
    `Проверок без отправки: ${(r.checks || []).reduce((n,x)=>n+x.n,0)}. Расход за 24 часа: ${r.used_24h ?? '—'}/${r.daily_limit ?? '—'}.`,
    Object.values(r.unclassified || {}).some(n=>n>0)?'Импортированные записи без подтверждённого paid/free-признака учтены отдельно в журнале.':null,
    `Требуют сверки сейчас: pending ${r.unresolved_now.pending || 0}, uncertain ${r.unresolved_now.uncertain || 0}.`,
    `Состояние на момент отчёта: ${r.enabled?'включён':'остановлен'}. Групп на блокировке: ${r.blocked_groups || 0}.`,
    r.halt?'Глобальная остановка: '+String(r.halt).slice(0,100):null,
    r.wait_until>r.generated_at?'Ожидание Telegram до '+date(r.wait_until):null,
    r.generated_at>r.end+15*60_000?'Отчёт сформирован с задержкой.':null,
    'Поиск групп и завершённая очередь кандидатов отключены.',
    'Подтверждение API не доказывает видимость. Ноль отправок не доказывает исправность.'
  ].filter(Boolean).join('\n');
}
export function enqueueReport(state,Engine,report) {
  validateReport(report);
  if(!state.importedAt || !Number.isSafeInteger(state.config?.owner_id))throw Error('existing_desk_owner_required');
  const key='charter-sender-hour:'+report.end;
  const old=state.outbox.find(x=>x.dedupe===key);
  if(!old)new Engine(state).enqueue('owner',{chat_id:state.config.owner_id,text:formatReport(report)},null,key);
  const item=state.outbox.find(x=>x.dedupe===key);
  return {key,state:item.state==='sending'?'pending':item.state,message_id:item.result_message_id || null};
}
