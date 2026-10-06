export function validateReport(r) {
  if(!Number.isSafeInteger(r?.end) || r.end%3600000 || r.start!==r.end-3600000 || !r.attempts || !r.unresolved_now || !Array.isArray(r.groups))throw Error('invalid_report');
  for(const counts of [r.attempts,r.unresolved_now])if(Object.values(counts).some(n=>!Number.isSafeInteger(n) || n<0))throw Error('invalid_report_counts');
}
export function formatReport(r) {
  validateReport(r);
  const date=ms=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(ms);
  const n=key=>r.free?.[key] || 0;
  return [`Charter Capital · ${date(r.start)} — ${date(r.end)} (Бангкок)`,
    'Бесплатные группы — отчёт за час:',
    `Подтверждено Telegram: ${n('sent')}. Внешних подтверждений: ${n('sent_external')}.`,
    `Ошибок: ${n('failed')}. Неопределённых за час: ${n('uncertain')}. Пропущено/отменено: ${n('cancelled')}.`,
    r.paid_window?`Оплаченные группы — ${date(r.paid_window.start)} — ${date(r.paid_window.end)}: подтверждено ${r.paid_window.attempts.sent || 0}, ошибок ${r.paid_window.attempts.failed || 0}, неопределённых ${r.paid_window.attempts.uncertain || 0}, пропущено/отменено ${r.paid_window.attempts.cancelled || 0}.`:null,
    Object.values(r.unclassified || {}).some(n=>n>0)?'Импортированные записи без подтверждённого paid/free-признака учтены отдельно в журнале.':null,
    `Требуют сверки сейчас: pending ${r.unresolved_now.pending || 0}, uncertain ${r.unresolved_now.uncertain || 0}.`,
    `Состояние на момент отчёта: ${r.enabled?'включён':'остановлен'}. Групп на блокировке: ${r.blocked_groups || 0}.`,
    r.halt?'Глобальная остановка: '+String(r.halt).slice(0,100):null,
    r.wait_until>r.generated_at?'Ожидание Telegram до '+date(r.wait_until):null,
    r.generated_at>r.end+15*60_000?'Отчёт сформирован с задержкой.':null,
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
