const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, readFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {parseSnapshot, writeRate, readTableSnapshot, readSnapshot, BANK_URL} = require('../scripts/update_property_bank.cjs');
const now = new Date('2026-10-15T10:00:00Z');
const fixture = () => ({headers:['Currency','Description','Bank NotesBuying Rates','Bank NotesSelling Rates','Sight BillBuying Rates','TTBuying Rates','Bill - DD - TTSelling Rates'],
  date:'15 Oct 2026',time:'2: 14:30     ',rows:[['USD1','USD: 1-2','32.23','33.77','','',''],['USD50','USD: 50-100','33.05','33.77','33.27     ','33.37','33.67']]});

test('uses Sight Bill rather than adjacent cash or TT columns and keeps bank time', () => {
  const data = parseSnapshot(fixture(), now);
  assert.equal(data.rate, 33.27); assert.equal(data.sellingRate, 33.67);
  assert.equal(data.publishedAt, '2026-10-15T14:30:00+07:00');
  assert.equal(data.checkedAt, now.toISOString()); assert.equal(data.type,'sight-bill-buying');
});
function tableDocument(snapshot, {current = true, legacy = false, legacySnapshot = fixture()} = {}) {
  const table = value => ({
    querySelector: selector => selector === 'input[name="date"]' ? {value:value.date}
      : selector === 'select' ? {selectedOptions:[{textContent:value.time}]} : null,
    querySelectorAll: selector => selector === 'th' ? value.headers.map(textContent => ({textContent}))
      : selector === 'tr' ? value.rows.map(cells => ({querySelectorAll: () => cells.map(textContent => ({textContent}))})) : [],
  });
  const currentTable = current ? table(snapshot) : null;
  const oldTable = legacy ? table(legacySnapshot) : null;
  return {querySelector: selector => ({
    'table.forex-rates-table':currentTable,
    '#exchange-rates':oldTable,
    '#forex-rates-date-text-input':current ? {value:snapshot.date} : null,
    '.forex-rates-time-label':current ? {textContent:snapshot.time} : null,
  })[selector] ?? null};
}
test('reads the current AEM bank table, custom date and time controls, and typographic dash', () => {
  const current = {...fixture(),date:'28 Oct 2026',time:'1: 08:30',
    headers:[...fixture().headers.slice(0,6),'Bill - DD – TT Selling Rates'],
    rows:[['USD50','USD: 50-100','33.31','34.04','33.54','33.64','33.94']]};
  const snapshot = readTableSnapshot(tableDocument(current));
  const data = parseSnapshot(snapshot,new Date('2026-10-28T13:00:00Z'));
  assert.equal(data.rate,33.54);
  assert.equal(data.sellingRate,33.94);
  assert.equal(data.publishedAt,'2026-10-28T08:30:00+07:00');
  assert.equal(data.checkedAt,'2026-10-28T13:00:00.000Z');
});
test('retains the legacy layout fallback without mixing metadata when a current table exists', () => {
  assert.deepEqual(readTableSnapshot(tableDocument(fixture(),{current:false,legacy:true})),fixture());
  assert.equal(readTableSnapshot(tableDocument({...fixture(),time:''},{legacy:true})),null);
  assert.equal(readTableSnapshot(tableDocument(fixture(),{current:false})),null);
});
test('waits for both publication metadata and a complete populated USD50 row', () => {
  for (const change of [{date:''},{time:''},{rows:[]},{rows:[['USD50','USD: 50-100','','','','','']]},
    {rows:[['USD50','USD: 50-100','33.31','34.04','33.54','33.64']]}]) {
    assert.equal(readTableSnapshot(tableDocument({...fixture(),...change})),null);
  }
  // Changing the layout must not relax strict column validation after loading.
  const changed = {...fixture(),headers:[...fixture().headers].reverse()};
  assert.throws(() => parseSnapshot(readTableSnapshot(tableDocument(changed)),now));
});
test('fails closed for changed columns, duplicate currency, incomplete and invalid rates', () => {
  const cases = [f=>f.headers.reverse(), f=>f.rows.push(f.rows[1]), f=>f.rows[1].pop(), f=>f.rows[1][4]='0', f=>f.rows[1][4]='NaN', f=>f.rows[1][4]='33,27', f=>f.rows[1][6]='30'];
  for (const mutate of cases) {const value=fixture();mutate(value);assert.throws(()=>parseSnapshot(value,now));}
});
test('rejects missing, impossible, ambiguous or future publication dates', () => {
  for (const day of ['', '31 Feb 2026','2026-10-15','16 Oct 2026']) assert.throws(()=>parseSnapshot({...fixture(),date:day},now));
  for (const time of ['', '2: 25:30', '14:30']) assert.throws(()=>parseSnapshot({...fixture(),time},now));
  assert.equal(parseSnapshot({...fixture(),date:'14 Oct 2026'},now).publishedAt,'2026-10-14T14:30:00+07:00');
});
test('unchanged publication refreshes its actual verification after 15 minutes; publication and verification regressions are rejected', t => {
  const dir=mkdtempSync(join(tmpdir(),'thaipay-bank-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'bank.json'), first=parseSnapshot(fixture(),now);
  assert.equal(writeRate(file,first),true);
  const rapid={...first,checkedAt:'2026-10-15T10:14:59.999Z'}; assert.equal(writeRate(file,rapid),false);
  assert.equal(JSON.parse(readFileSync(file)).checkedAt,first.checkedAt);
  const boundary={...first,checkedAt:'2026-10-15T10:15:00Z'}; assert.equal(writeRate(file,boundary),true);
  assert.equal(JSON.parse(readFileSync(file)).checkedAt,boundary.checkedAt);
  const later={...first,checkedAt:'2026-10-15T11:00:00Z'}; assert.equal(writeRate(file,later),true);
  assert.equal(JSON.parse(readFileSync(file)).checkedAt,later.checkedAt);
  assert.equal(JSON.parse(readFileSync(file)).publishedAt,first.publishedAt);
  assert.equal(writeRate(file,{...later,checkedAt:'2026-10-15T11:01:00Z'},true),true);
  assert.throws(()=>writeRate(file,later,true),/older bank verification/);
  const tomorrow={...first,checkedAt:'2026-10-16T02:00:00Z'};assert.equal(writeRate(file,tomorrow),true);
  const updated={...tomorrow,rate:33.28,publishedAt:'2026-10-16T08:30:00+07:00'};assert.equal(writeRate(file,updated),true);
  assert.throws(()=>writeRate(file,first));assert.equal(JSON.parse(readFileSync(file)).rate,33.28);
});

const timeoutError = () => Object.assign(new Error('page.waitForFunction: Timeout 45000ms exceeded.'),{name:'TimeoutError'});
function readerHarness(attempts) {
  const state={launchOptions:null,contexts:[],logs:[],browserClosed:false};
  const launch=async options => {
    state.launchOptions=options;
    return {
      newContext:async contextOptions => {
        const config=attempts[state.contexts.length] || {};
        const record={options:contextOptions,closed:false};state.contexts.push(record);
        return {
          newPage:async () => ({
            goto:async (url,options) => {record.goto={url,options};if(config.gotoError)throw config.gotoError;},
            waitForFunction:async (fn,arg,options) => {record.wait={fn,arg,options};if(config.waitError)throw config.waitError;},
            evaluate:async fn => {record.evaluate=fn;if(config.evaluateError)throw config.evaluateError;return config.snapshot || fixture();},
          }),
          close:async () => {record.closed=true;},
        };
      },
      close:async () => {state.browserClosed=true;},
    };
  };
  return {state,options:{launch,now:()=>now,log:message=>state.logs.push(message)}};
}
test('a transient navigation or load timeout retries in fresh bounded English Bangkok pages', async () => {
  const h=readerHarness([{gotoError:new Error('page.goto: net::ERR_CONNECTION_RESET')},{waitError:timeoutError()},{}]);
  assert.deepEqual(await readSnapshot(h.options),fixture());
  assert.equal(h.state.contexts.length,3);assert.equal(h.state.logs.length,2);
  assert.deepEqual(h.state.launchOptions,{channel:'chrome',headless:true});
  for(const context of h.state.contexts){
    assert.equal(context.closed,true);
    assert.deepEqual(context.options,{locale:'en-US',timezoneId:'Asia/Bangkok'});
    assert.equal(context.goto.url,BANK_URL.toLowerCase());
    assert.equal(context.goto.options.timeout,45000);
    if(context.wait){assert.equal(context.wait.fn,readTableSnapshot);assert.equal(context.wait.options.timeout,45000);}
  }
  assert.equal(h.state.browserClosed,true);
});
test('three transient failures stop the reader and leave the previous published rate untouched', async t => {
  const dir=mkdtempSync(join(tmpdir(),'thaipay-bank-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'bank.json');writeRate(file,parseSnapshot(fixture(),now));
  const previous=readFileSync(file,'utf8');
  const h=readerHarness(Array.from({length:4},()=>({waitError:timeoutError()})));
  await assert.rejects(async()=>writeRate(file,parseSnapshot(await readSnapshot(h.options),now)),/Timeout 45000ms/);
  assert.equal(h.state.contexts.length,3);assert.equal(h.state.logs.length,2);
  assert(h.state.contexts.every(context=>context.closed));assert.equal(h.state.browserClosed,true);
  assert.equal(readFileSync(file,'utf8'),previous);
});
test('schema, date and non-transient browser failures fail closed without retrying', async () => {
  const changed=fixture();changed.headers.reverse();
  for(const [config,expected] of [
    [{snapshot:changed},/columns changed/],
    [{snapshot:{...fixture(),date:'16 Oct 2026'}},/future/],
    [{gotoError:new Error('page.goto: invalid URL')},/invalid URL/],
    [{evaluateError:timeoutError()},/Timeout 45000ms/],
  ]){
    const h=readerHarness([config,{}]);
    await assert.rejects(()=>readSnapshot(h.options),expected);
    assert.equal(h.state.contexts.length,1);assert.equal(h.state.logs.length,0);
    assert.equal(h.state.contexts[0].closed,true);assert.equal(h.state.browserClosed,true);
  }
});
