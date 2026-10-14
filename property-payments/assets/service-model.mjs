export function parseUsd(value) {
 const clean=String(value).replace(/[\s\u00a0\u202f]/g,"").replace(",",".");
 if(!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
 const amount=Number(clean);
 return Number.isFinite(amount)&&amount>=.01&&amount<=1e9?amount:null;
}
export function referralContext(search) {
 const params=new URLSearchParams(search);
 const amount=parseUsd(params.get("usd")??"");
 return {amount, currency:params.get("currency")==="USDT"?"USDT":"RUB", fromAggregator:["thaipay", "estatepayhub"].includes(params.get("utm_source"))};
}
export function partnerContext(search) {
 const params=new URLSearchParams(search);
 const code=/^tp_[0-9a-f]{20}$/.test(params.get('ref')||'')?params.get('ref'):null;
 const visit=code && /^v_[0-9a-f]{20}$/.test(params.get('tp_visit')||'')?params.get('tp_visit'):null;
 return {code,visit};
}
export function partnerContactUrl(search,amount,currency) {
 const {code}=partnerContext(search);if(!code)return null;
 const url=new URL('https://thaipay.pro/go/contact');url.searchParams.set('ref',code);
 const valid=parseUsd(amount??'');if(valid!==null)url.searchParams.set('usd',String(valid));
 url.searchParams.set('currency',currency==='USDT'?'USDT':'RUB');return url.href;
}
