export const MAX_REPORT_WINDOW_MS=24*60*60*1000;
export const MAX_REPORT_RECORDS=20000;
export class ReportQueryError extends Error {
  constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
function utc(value){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw new ReportQueryError('utc_timestamp_required');
  const ms=Date.parse(value),canonical=value.includes('.')?value:value.replace('Z','.000Z');
  if(!Number.isFinite(ms) || new Date(ms).toISOString()!==canonical)throw new ReportQueryError('invalid_utc_timestamp');
  return ms;
}
export function validateReportQuery(input,now=Date.now()){
  const keys=['scope','start_utc','end_utc'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length!==3 || Object.keys(input).some(k=>!keys.includes(k)))throw new ReportQueryError('scope_start_utc_end_utc_required');
  if(!['free','paid'].includes(input.scope))throw new ReportQueryError('scope_must_be_free_or_paid');
  const start=utc(input.start_utc),end=utc(input.end_utc);
  if(start>=end || start<0 || end>now)throw new ReportQueryError('invalid_or_future_window');
  if(end-start>MAX_REPORT_WINDOW_MS)throw new ReportQueryError('window_exceeds_24_hours');
  return {scope:input.scope,start,end};
}
export function reportQueryFromUrl(url,now=Date.now()){
  const entries=[...new URL(url).searchParams];
  if(new Set(entries.map(([k])=>k)).size!==entries.length)throw new ReportQueryError('duplicate_query_parameter');
  const input=Object.fromEntries(entries);validateReportQuery(input,now);return input;
}
