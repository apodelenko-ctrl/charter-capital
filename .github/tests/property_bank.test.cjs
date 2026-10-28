const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, readFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {parseSnapshot, writeRate, readTableSnapshot} = require('../scripts/update_property_bank.cjs');
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
test('same publication avoids hourly commits, a new bank day or publication updates, regressions never replace good data', t => {
  const dir=mkdtempSync(join(tmpdir(),'thaipay-bank-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'bank.json'), first=parseSnapshot(fixture(),now);
  assert.equal(writeRate(file,first),true);
  const later={...first,checkedAt:'2026-10-15T11:00:00Z'}; assert.equal(writeRate(file,later),false);
  assert.equal(JSON.parse(readFileSync(file)).checkedAt,first.checkedAt);
  assert.equal(writeRate(file,later,true),true);
  const tomorrow={...first,checkedAt:'2026-10-16T02:00:00Z'};assert.equal(writeRate(file,tomorrow),true);
  const updated={...tomorrow,rate:33.28,publishedAt:'2026-10-16T08:30:00+07:00'};assert.equal(writeRate(file,updated),true);
  assert.throws(()=>writeRate(file,first));assert.equal(JSON.parse(readFileSync(file)).rate,33.28);
});
