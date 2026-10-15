/** Read the bank's public table in normal Chrome; reject changed columns and bad dates. */
const fs = require('node:fs');
const path = require('node:path');
const BANK_URL = 'https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates';
const HEADERS = ['Currency', 'Description', 'BankNotesBuyingRates', 'BankNotesSellingRates', 'SightBillBuyingRates', 'TTBuyingRates', 'Bill-DD-TTSellingRates'];
const compact = value => String(value ?? '').replace(/\s+/g, '');
const bangkokDay = value => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'}).format(value);

function parseSnapshot(snapshot, checkedAt = new Date()) {
  if (!snapshot || !Array.isArray(snapshot.headers) || snapshot.headers.length !== HEADERS.length
    || snapshot.headers.some((value, i) => compact(value) !== HEADERS[i])) throw new Error('The official bank table columns changed');
  const rows = snapshot.rows?.filter(cells => compact(cells[0]) === 'USD50');
  if (rows?.length !== 1 || rows[0].length !== 7 || !/^USD:/i.test(rows[0][1])) throw new Error('A single complete USD50 bank row is required');
  const money = value => {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,8})?$/.test(text)) throw new Error('Invalid bank rate');
    const number = Number(text);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) throw new Error('Invalid bank rate');
    return number;
  };
  const rate = money(rows[0][4]), tt = money(rows[0][5]), sellingRate = money(rows[0][6]);
  if (sellingRate < rate || sellingRate < tt) throw new Error('Bank buying and selling rates are inconsistent');
  const date = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})$/.exec(String(snapshot.date).trim());
  const time = /^\d+:\s*([01]\d|2[0-3]):([0-5]\d)\s*$/.exec(String(snapshot.time).trim());
  if (!date || !time) throw new Error('Bank publication date or time is missing');
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(date[2]) + 1;
  const day = `${date[3]}-${String(month).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
  const calendar = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== day) throw new Error('Invalid bank calendar date');
  const publishedAt = day + 'T' + time[1] + ':' + time[2] + ':00+07:00';
  if (!Number.isFinite(checkedAt.getTime()) || Date.parse(publishedAt) > checkedAt.getTime()) throw new Error('Bank publication is in the future');
  return {provider:'Bangkok Bank', pair:'USD/THB', type:'sight-bill-buying', rate, sellingRate,
    publishedAt, checkedAt:checkedAt.toISOString(), source:BANK_URL, url:BANK_URL};
}

function writeRate(file, data, force = false) {
  if (fs.existsSync(file)) {
    let previous;
    try {previous = JSON.parse(fs.readFileSync(file, 'utf8'));} catch {previous = null;}
    if (previous && Date.parse(previous.publishedAt) > Date.parse(data.publishedAt)) throw new Error('Refusing an older bank publication');
    const fields = Object.keys(data).filter(key => key !== 'checkedAt');
    if (!force && previous && Number.isFinite(Date.parse(previous.checkedAt))
      && bangkokDay(new Date(previous.checkedAt)) === bangkokDay(new Date(data.checkedAt))
      && fields.every(key => previous[key] === data[key])) return false;
  }
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
  return true;
}

async function readSnapshot() {
  // Dependency is installed only in the scheduled runner; no visitor browser is used.
  const {chromium} = require('playwright');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(BANK_URL, {waitUntil:'domcontentloaded', timeout:45000});
    await page.locator('#exchange-rates tr').filter({hasText:'USD50'}).waitFor({timeout:30000});
    // Rates and publication metadata arrive through independent bank requests.
    // A visible USD row alone does not establish which dated publication it is.
    await page.waitForFunction(() => {
      const date=document.querySelector('#exchange-rates input[name="date"]')?.value || '';
      const time=document.querySelector('#exchange-rates select')?.selectedOptions[0]?.textContent || '';
      return /^\d{1,2} [A-Z][a-z]{2} 20\d{2}$/.test(date.trim()) && /^\d+:\s*\d{2}:\d{2}\s*$/.test(time.trim());
    }, undefined, {timeout:45000});
    return await page.evaluate(() => ({
      headers:[...document.querySelectorAll('#exchange-rates th')].map(element => element.textContent),
      rows:[...document.querySelectorAll('#exchange-rates tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)).filter(cells => cells.length),
      date:document.querySelector('#exchange-rates input[name="date"]')?.value,
      time:document.querySelector('#exchange-rates select')?.selectedOptions[0]?.textContent,
    }));
  } finally {await browser.close();}
}

async function main() {
  const snapshot = await readSnapshot();
  const data = parseSnapshot(snapshot, new Date());
  const file = process.argv.slice(2).find(value => !value.startsWith('--')) || 'thai-payments/bangkok-bank.json';
  const changed = writeRate(file, data, process.argv.includes('--force-refresh'));
  console.log(`Bangkok Bank Sight Bill ${data.rate} THB/USD, published ${data.publishedAt}: ${changed ? 'updated' : 'already current'}`);
}
module.exports = {parseSnapshot, writeRate, BANK_URL};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
