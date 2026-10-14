import {paymentRate,paymentAmount,calculationConfirmed,isValidCbr,moscowDay} from './calculation.mjs';
import {parseUsd,referralContext,partnerContext,partnerContactUrl} from './service-model.mjs?v=20261015-links-1';
import {initMotion,animateValues} from './motion.mjs?v=charter-pay-1';
const base='https://ccapital.pro/thai-payments/';
const ui=Object.fromEntries(['amount','error','total','percent','rate','fee','status','cbr','request','closing','receive','copy'].map(id=>[id,document.getElementById('service-'+id)]));
const copyStatus=document.getElementById('copy-status');
const copyFallback=document.getElementById('copy-fallback');
let currency='RUB',cbr=null,tariff={rubPremium:.03,usdtInputFee:.025};
const money=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const rateNumber=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:4,maximumFractionDigits:4});
const shortNumber=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const symbol=()=>currency==='RUB'?'₽':'USDT';
const offer=(curr=currency)=>({own:true,currency:curr,cost:curr==='RUB'?tariff.rubPremium:tariff.usdtInputFee});
function requestUrl(amount){
  const tracked=partnerContactUrl(location.search,amount,currency);if(tracked)return tracked;
  const url=new URL('https://t.me/ccapital_acces');
  let message='Здравствуйте! Хочу оплатить недвижимость в Таиланде через Charter Pay.\nК зачислению получателю: '+shortNumber.format(amount)+' USD.\nСпособ внесения: '+currency+'.\nПрошу подготовить окончательный расчёт и агентский договор.\nМаршрут: Гонконг, платёж от имени поручителя.\nЗачисление: T+1.';
  if(referralContext(location.search).fromAggregator)message+='\nИсточник: ThaiPay.';
  url.searchParams.set('text',message);return url.href;
}
function calculationText(){
  const partner=partnerContext(location.search);
  return 'Charter Pay · оплата недвижимости в Таиланде\nВы вносите: '+ui.total.textContent+'\nПолучатель получает: '+ui.receive.textContent+'\nТариф: '+ui.percent.textContent+'\nРасчётный курс: '+ui.rate.textContent+'\nВаши затраты на перевод: '+ui.fee.textContent+'\n'+ui.status.textContent+'\nОкончательный расчёт и расходы банков согласуются до оплаты.\nhttps://ccapital.pro/property-payments/'+(partner.code?'\nРекомендация ThaiPay: '+partner.code+(partner.visit?' · Код обращения: '+partner.visit:''):'');
}
function render(){
  const amount=parseUsd(ui.amount.value),current=offer(),total=paymentAmount(amount,current,cbr),confirmed=calculationConfirmed(amount,current,cbr);
  ui.error.hidden=amount!==null;ui.amount.setAttribute('aria-invalid',String(amount===null));
  ui.percent.textContent=currency==='RUB'?'ЦБ + '+shortNumber.format(tariff.rubPremium*100)+'%':shortNumber.format(tariff.usdtInputFee*100)+'% от USDT';
  ui.total.textContent=total===null?'—':money.format(total)+' '+symbol();
  ui.receive.textContent=amount===null?'—':money.format(amount)+' USD';
  const rate=paymentRate(current,cbr);
  ui.rate.textContent=rate===null?'Курс ЦБ недоступен':rateNumber.format(rate)+' '+symbol()+' за 1 USD';
  const fee=total===null?null:currency==='RUB'?total-amount*cbr.rate:total-amount;
  ui.fee.textContent=fee===null?'—':money.format(fee)+' '+symbol()+(currency==='RUB'?' к ЦБ':'');
  ui.status.textContent=confirmed?'Актуальность расчёта подтверждена при переводе через Charter Pay':amount===null?'Укажите корректную сумму':cbr?'Требуется обновление курса ЦБ':'Получаем официальный курс ЦБ';
  ui.status.className='calculation-status '+(confirmed?'confirmed':'pending');
  ui.cbr.hidden=currency==='USDT';
  if(cbr){ui.cbr.href=cbr.url;ui.cbr.textContent='ЦБ РФ · '+cbr.date.split('-').reverse().join('.')+' · '+rateNumber.format(cbr.rate)+' ₽/USD ↗';}
  for(const link of [ui.request,ui.closing]){
    if(amount===null||total===null){link.setAttribute('aria-disabled','true');link.removeAttribute('href');}
    else{link.removeAttribute('aria-disabled');link.href=requestUrl(amount);}
  }
  if(partnerContext(location.search).code)document.querySelectorAll('[data-partner-contact]').forEach(link=>{link.href=requestUrl(amount);});
  ui.copy.disabled=amount===null||total===null;copyStatus.textContent='';copyFallback.hidden=true;
  const example=paymentAmount(10000,offer('RUB'),cbr);document.getElementById('example-rub').textContent=example===null?'Получаем курс ЦБ':money.format(example)+' ₽';
  animateValues([ui.total,ui.receive]);
}
async function json(url){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(url,{cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error('Unavailable');return await response.json();}finally{clearTimeout(timeout);}
}
async function refresh(){try{const value=await json(base+'cbr.json');if(!isValidCbr(value)||value.checkedFor>moscowDay())throw new Error('Invalid');cbr=value;}catch{}render();}
ui.amount.addEventListener('input',render);
document.querySelectorAll('input[name="service-currency"]').forEach(input=>input.addEventListener('change',()=>{currency=input.value;render();}));
document.querySelectorAll('[data-amount]').forEach(button=>button.addEventListener('click',()=>{ui.amount.value=button.dataset.amount;render();}));
[ui.request,ui.closing].forEach(link=>link.addEventListener('click',event=>{if(link.getAttribute('aria-disabled')==='true')event.preventDefault();}));
ui.copy.addEventListener('click',async()=>{
  if(ui.copy.disabled)return;
  const text=calculationText();
  try{await navigator.clipboard.writeText(text);copyStatus.textContent='Расчёт скопирован';}
  catch{copyFallback.value=text;copyFallback.hidden=false;copyFallback.focus();copyFallback.select();copyStatus.textContent='Выделите и скопируйте расчёт из поля ниже.';}
});
const context=referralContext(location.search);if(context.amount!==null)ui.amount.value=String(context.amount);
document.querySelectorAll('a[href^="https://t.me/ccapital_acces"]').forEach(link=>{if(link!==ui.request&&link!==ui.closing)link.dataset.partnerContact='true';});
currency=context.currency;document.querySelector('input[name="service-currency"][value="'+currency+'"]').checked=true;
initMotion();render();
try{const data=await json(base+'offers.json');if(Number.isFinite(data.charter?.rubPremium)&&data.charter.rubPremium>=0&&Number.isFinite(data.charter?.usdtInputFee)&&data.charter.usdtInputFee>=0&&data.charter.usdtInputFee<1)tariff=data.charter;}catch{}
await refresh();
setInterval(()=>{if(document.visibilityState==='visible')refresh();},300000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
