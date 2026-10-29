/** Read the bank's public table in normal Chrome; reject changed columns and bad dates. */
const fs = require('node:fs');
const path = require('node:path');
const BANK_URL = 'https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates';
const READ_ATTEMPTS = 3;
const READ_TIMEOUT_MS = 45000;
const VERIFICATION_COALESCE_MS = 15 * 60 * 1000;
const HEADERS = ['Currency', 'Description', 'BankNotesBuyingRates', 'BankNotesSellingRates', 'SightBillBuyingRates', 'TTBuyingRates', 'Bill-DD-TTSellingRates'];
const compact = value => String(value ?? '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '');

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
    const previousCheck = Date.parse(previous?.checkedAt), checked = Date.parse(data.checkedAt);
    if (Number.isFinite(previousCheck) && checked < previousCheck) throw new Error('Refusing an older bank verification');
    const fields = Object.keys(data).filter(key => key !== 'checkedAt');
    if (!force && previous && Number.isFinite(previousCheck)
      && checked - previousCheck < VERIFICATION_COALESCE_MS
      && fields.every(key => previous[key] === data[key])) return false;
  }
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
  return true;
}

// This self-contained function is also executed inside the bank's page. Keep
// date/time tied to the selected table layout; never mix two publications.
function readTableSnapshot(sourceDocument = document) {
  const current = sourceDocument.querySelector('table.forex-rates-table');
  const table = current || sourceDocument.querySelector('#exchange-rates');
  if (!table) return null;
  const date = current
    ? sourceDocument.querySelector('#forex-rates-date-text-input')?.value
    : table.querySelector('input[name="date"]')?.value;
  const time = current
    ? sourceDocument.querySelector('.forex-rates-time-label')?.textContent
    : table.querySelector('select')?.selectedOptions[0]?.textContent;
  const snapshot = {
    headers:[...table.querySelectorAll('th')].map(element => element.textContent),
    rows:[...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)).filter(cells => cells.length),
    date, time,
  };
  // Rates and metadata load independently. A table row alone cannot establish
  // its publication time, and an initial empty row must not renew checkedAt.
  if (!/^\d{1,2} [A-Z][a-z]{2} 20\d{2}$/.test(String(date ?? '').trim())
    || !/^\d+:\s*\d{2}:\d{2}\s*$/.test(String(time ?? '').trim())
    || !snapshot.rows.some(cells => String(cells[0]).replace(/\s+/g, '') === 'USD50'
      && cells.length === 7 && cells.slice(4,7).every(cell => String(cell).trim()))) return null;
  return snapshot;
}

function transientReadFailure(error) {
  return error?.name === 'TimeoutError'
    || /net::ERR_(?:TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_REFUSED|NETWORK_CHANGED|NAME_NOT_RESOLVED|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR|ABORTED)\b/.test(String(error?.message));
}

async function readSnapshot({launch, now = () => new Date(), log = message => console.warn(message)} = {}) {
  // Dependency is installed only in the scheduled runner; no visitor browser is used.
  const launchBrowser = launch || (options => require('playwright').chromium.launch(options));
  const browser = await launchBrowser({channel:'chrome', headless:true});
  try {
    for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
      const context = await browser.newContext({locale:'en-US', timezoneId:'Asia/Bangkok'});
      try {
        const page = await context.newPage();
        try {
          // The bank redirects legacy mixed-case paths to this canonical URL.
          await page.goto(BANK_URL.toLowerCase(), {waitUntil:'domcontentloaded', timeout:READ_TIMEOUT_MS});
          await page.waitForFunction(readTableSnapshot, undefined, {timeout:READ_TIMEOUT_MS});
        } catch (error) {
          if (!transientReadFailure(error) || attempt === READ_ATTEMPTS) throw error;
          log(`Bangkok Bank read attempt ${attempt}/${READ_ATTEMPTS} failed transiently; retrying in a fresh page.`);
          continue;
        }
        const snapshot = await page.evaluate(readTableSnapshot);
        // Validation failures must stop the run, never become a retry that
        // silently accepts a different or incomplete financial publication.
        parseSnapshot(snapshot, now());
        return snapshot;
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}

async function main() {
  const snapshot = await readSnapshot();
  const data = parseSnapshot(snapshot, new Date());
  const file = process.argv.slice(2).find(value => !value.startsWith('--')) || 'thai-payments/bangkok-bank.json';
  const changed = writeRate(file, data, process.argv.includes('--force-refresh'));
  console.log(`Bangkok Bank Sight Bill ${data.rate} THB/USD, published ${data.publishedAt}: ${changed ? 'updated' : 'already current'}`);
}
module.exports = {parseSnapshot, writeRate, readTableSnapshot, readSnapshot, BANK_URL};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
