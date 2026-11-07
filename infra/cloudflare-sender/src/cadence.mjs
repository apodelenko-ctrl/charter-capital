// Night start 23:00 Europe/Moscow is the explicitly recorded owner assumption.
// Night end 07:00 and 25-minute minimum are requested; never weaken group rules.
const moscow=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'});
export const PAID_HANDLES=new Set(['exchange_cmsk','pointofexchange','obmenmsk7','currencyexchange_m','obmenmsk01','obmenmsk1','exchange_moscow1','obmenvalytmoskva','obmen_valyuty']);
export function dayFloor(g){return g.paid?(PAID_HANDLES.has(g.handle?.toLowerCase()) && g.paid_day_interval_seconds===150?150000:300000):600000;}
export function baseInterval(g){return Math.max(dayFloor(g),g.interval_ms,g.slowmode_ms);}
export function isNight(now){const hour=Number(moscow.format(now));return hour>=23 || hour<7;}
export function nextCadenceAt(g,last,now) {
  if(last==null)return now;
  const base=baseInterval(g);
  let at=Math.max(now,last+base);
  if(g.paid && isNight(at) && at<last+Math.max(base,1500000)) {
    // Moscow is UTC+03:00 throughout the supported runtime period.
    const local=new Date(at+3*3600000);
    const end=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+(local.getUTCHours()>=23?1:0),7)-3*3600000;
    at=Math.min(last+Math.max(base,1500000),end);
  }
  return at;
}
