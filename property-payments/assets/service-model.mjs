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
