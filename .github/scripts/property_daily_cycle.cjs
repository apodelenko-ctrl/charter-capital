/** One frozen official rate set per Moscow day. Official FX readers stay separate.
 * committed freezes hashes of both JSONs in one atomic push. published is only
 * recorded after matching Pages history AND a complete live readback. An
 * unfinished committed set must be recovered before any later source refresh.
 * The Moscow day of confirmed live readback consumes that day's update limit,
 * including recovery of an older set; it never changes the source-check day.
 */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');

const FILES = ['cbr.json', 'bangkok-bank.json'];
const DIRECTORY = 'thai-payments/';
const STATE = DIRECTORY + 'daily-cycle.json';
const CRONS = ['0 11 * * *', '7 11 * * *', '17 11 * * *', '37 11-23 * * *'];
const BANK = 'https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates';
const verifiedProofs = new WeakSet();
const fail = message => {throw new Error(message);};
const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  && isoDay(value.slice(0,10)) && Number.isFinite(Date.parse(value));
function localTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('Invalid cycle clock');
  const parts = new Intl.DateTimeFormat('en', {timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return {day:['year','month','day'].map(part).join('-'), hour:Number(part('hour'))};
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPair = bytes => Object.fromEntries(FILES.map(name => [name, hash(bytes[name])]));
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
const readAt = (cwd, revision, file) => execFileSync('git', ['show', revision + ':' + file], {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']});
function parse(bytes, label) {try {return JSON.parse(bytes);} catch {fail('Invalid ' + label);}}
function pairAt(cwd, revision) {return Object.fromEntries(FILES.map(name => [name, readAt(cwd, revision, DIRECTORY + name)]));}
function isAncestor(cwd, ancestor, descendant) {
  try {git(cwd, 'merge-base', '--is-ancestor', ancestor, descendant); return true;} catch {return false;}
}
function clean(cwd) {if (git(cwd, 'status', '--porcelain')) fail('Cycle checkout must be clean');}
function remoteHead(cwd) {
  git(cwd, 'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main', 'refs/heads/gh-pages:refs/remotes/origin/gh-pages');
  const main = git(cwd, 'rev-parse', 'origin/main');
  if (main !== git(cwd, 'rev-parse', 'origin/gh-pages')) fail('Publishing branches differ; refusing a partial state');
  return main;
}
function fastForward(cwd, revision) {
  clean(cwd);
  if (git(cwd, 'rev-parse', 'HEAD') !== revision) git(cwd, 'merge', '--ff-only', revision);
}
function readState(cwd, revision) {
  const paths = git(cwd, 'ls-tree', '--name-only', revision, '--', STATE);
  // Absence is a supported first migration, not a swallowed Git/JSON error.
  if (!paths) {
    if (git(cwd,'log','-1','--format=%H',revision,'--',STATE)) fail('Daily cycle state disappeared; refusing an ambiguous migration');
    return null;
  }
  const state = parse(readAt(cwd, revision, STATE), 'daily cycle state');
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('Invalid daily cycle state');
  return state;
}

function validatePair(bytes, now) {
  const values = Object.fromEntries(FILES.map(name => [name, parse(bytes[name], name)]));
  const cbr = values['cbr.json'], bank = values['bangkok-bank.json'], today = localTime(now).day;
  const finite = n => Number.isFinite(n) && n > 0;
  if (!cbr || cbr.currency !== 'USD' || !finite(cbr.rate) || !finite(cbr.thbRub)
    || !isoDay(cbr.date) || !isoDay(cbr.checkedFor) || cbr.date > cbr.checkedFor || cbr.checkedFor > today
    || !timestamp(cbr.verifiedAt) || localTime(cbr.verifiedAt).day !== cbr.checkedFor
    || Date.parse(cbr.verifiedAt) > now.getTime() + 60000) fail('Invalid verified CBR set');
  const requested = cbr.checkedFor.split('-').reverse();
  if (cbr.source !== 'https://www.cbr.ru/scripts/XML_daily.asp?date_req=' + requested.join('/')
    || cbr.url !== 'https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&UniDbQuery.To=' + requested.join('.')) fail('Unexpected CBR source');
  if (!bank || bank.provider !== 'Bangkok Bank' || bank.pair !== 'USD/THB' || bank.type !== 'sight-bill-buying'
    || !finite(bank.rate) || bank.rate > 1000 || !finite(bank.sellingRate) || bank.sellingRate < bank.rate
    || bank.url !== BANK || bank.source !== BANK || !timestamp(bank.checkedAt) || !timestamp(bank.publishedAt)
    || Date.parse(bank.publishedAt) > Date.parse(bank.checkedAt) || Date.parse(bank.checkedAt) > now.getTime() + 60000) fail('Invalid verified Bangkok Bank set');
  return {values, cbrDay:cbr.checkedFor, bankDay:localTime(bank.checkedAt).day};
}
function validateState(cwd, base, state, bytes, now) {
  if (!state) return null;
  const pair = validatePair(bytes, now);
  if (state.version !== 1 || !['committed','published'].includes(state.status) || !['verified','adopted'].includes(state.origin)
    || !isoDay(state.day) || state.day > localTime(now).day || pair.cbrDay !== state.day || pair.bankDay !== state.day
    || !isDeepStrictEqual(state.rateHashes, hashPair(bytes)) || !timestamp(state.committedAt)
    || localTime(state.committedAt).day !== state.day || localTime(state.committedAt).hour < 11
    || Date.parse(state.committedAt) > now.getTime() + 60000) fail('Daily state does not match its complete verified rate set');
  const checks = [pair.values['cbr.json'].verifiedAt, pair.values['bangkok-bank.json'].checkedAt];
  if (checks.some(value => Date.parse(value) > Date.parse(state.committedAt))
    || (state.origin === 'verified' && checks.some(value => localTime(value).hour < 11))) fail('Daily source verification does not belong to the cycle');
  if (state.status === 'committed' && ['completedDay','confirmedAt','rateRevision','publishedRevision'].some(key => Object.hasOwn(state,key))) fail('Pending cycle has inconsistent completion metadata');
  if (state.status === 'published') {
    if (![state.rateRevision,state.publishedRevision].every(value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value))
      || !timestamp(state.confirmedAt) || Date.parse(state.confirmedAt) < Date.parse(state.committedAt)
      || Date.parse(state.confirmedAt) > now.getTime()
      || !isAncestor(cwd,state.rateRevision,state.publishedRevision) || !isAncestor(cwd,state.publishedRevision,base)
      || !isDeepStrictEqual(hashPair(pairAt(cwd,state.rateRevision)),state.rateHashes)
      || !isDeepStrictEqual(hashPair(pairAt(cwd,state.publishedRevision)),state.rateHashes)) fail('Invalid publication confirmation');
    const completed = localTime(state.confirmedAt);
    if (completed.hour < 11 || completed.day < state.day || completed.day > localTime(now).day
      || (Object.hasOwn(state,'completedDay') && state.completedDay !== completed.day)) fail('Inconsistent or future Moscow completion date');
  }
  return pair;
}
// Older published markers already carry the real confirmedAt. Derive their
// completion day conservatively, rather than treating a missing new field as
// permission for another course on the day recovery was verified.
function completedDay(state) {
  return state?.status === 'published' ? state.completedDay ?? localTime(state.confirmedAt).day : null;
}
const dayLocked = (state,day) => state && (state.day === day || completedDay(state) === day);
function eligibility({now, runCreatedAt, event, cron}) {
  if (event !== 'schedule' || !CRONS.includes(cron)) return 'Not an approved scheduled slot';
  if (!timestamp(runCreatedAt) || Date.parse(runCreatedAt) > now.getTime() + 60000) fail('Invalid authoritative workflow creation time');
  if (localTime(runCreatedAt).day !== localTime(now).day) return 'Delayed run belongs to another Moscow date';
  if (localTime(now).hour < 11) return 'Before 11:00 Moscow';
  return null;
}
function prepare({cwd, now = new Date(), runCreatedAt, event, cron}) {
  const reason = eligibility({now, runCreatedAt, event, cron});
  if (reason) return {mode:'skip', reason};
  clean(cwd);
  const base = remoteHead(cwd);
  fastForward(cwd, base);
  const bytes = pairAt(cwd, base), state = readState(cwd, base), pair = validatePair(bytes, now), day = localTime(now).day;
  validateState(cwd, base, state, bytes, now);
  const plan = {base, day, event, cron, runCreatedAt};
  // A committed set is already frozen, even if Pages or the acknowledgement failed.
  if (state?.status === 'committed') return {...plan, mode:'resume', cycleDay:state.day};
  if (dayLocked(state,day)) return {...plan, mode:'skip', reason:'This Moscow day already has a completed live publication'};
  if (!state && (pair.cbrDay === day || pair.bankDay === day)) {
    if (pair.cbrDay !== day || pair.bankDay !== day) fail('Migration found an ambiguous partial same-day verification');
    return {...plan, mode:'adopt'};
  }
  return {...plan, mode:'refresh'};
}
function writeAndPush(cwd, base, files, message, beforeWrite = () => {}) {
  if (git(cwd,'rev-parse','HEAD') !== base || remoteHead(cwd) !== base) fail('Repository advanced; do not overwrite or rebase a daily set');
  beforeWrite();
  git(cwd,'add','--',...files);
  git(cwd,'-c','user.name=github-actions[bot]','-c','user.email=github-actions[bot]@users.noreply.github.com','commit','-m',message);
  const revision = git(cwd,'rev-parse','HEAD');
  // A rejected/uncertain push remains unconfirmed. The next slot re-reads Git.
  beforeWrite();
  git(cwd,'push','--atomic','origin','HEAD:refs/heads/main','HEAD:refs/heads/gh-pages');
  return revision;
}
function commitPair({cwd, plan, now, clock = () => now || new Date()}) {
  const assertTime = () => {
    const at = clock();
    if (!['refresh','adopt'].includes(plan.mode) || eligibility({...plan,now:at}) || localTime(at).day !== plan.day) fail('Cycle is no longer eligible to commit');
    return at;
  };
  assertTime();
  if (git(cwd,'rev-parse','HEAD') !== plan.base || remoteHead(cwd) !== plan.base) fail('Repository changed during source verification');
  const allowed = FILES.map(name => DIRECTORY + name);
  const changed = git(cwd,'diff','--name-only','HEAD').split('\n').filter(Boolean);
  if (changed.some(file => !allowed.includes(file)) || git(cwd,'ls-files','--others','--exclude-standard')) fail('Unexpected pending files in the cycle checkout');
  const before = pairAt(cwd,plan.base), stateBefore = readState(cwd,plan.base);
  const at = assertTime();
  validateState(cwd,plan.base,stateBefore,before,at);
  if (stateBefore?.status === 'committed' || dayLocked(stateBefore,plan.day)) fail('The daily set is already frozen or this day is complete');
  const bytes = Object.fromEntries(FILES.map(name => [name,fs.readFileSync(path.join(cwd,DIRECTORY,name),'utf8')]));
  const pair = validatePair(bytes,at);
  if (pair.cbrDay !== plan.day || pair.bankDay !== plan.day) fail('Both sources must be verified on this Moscow date');
  const checks = [pair.values['cbr.json'].verifiedAt,pair.values['bangkok-bank.json'].checkedAt];
  if (checks.some(value => Date.parse(value) > at.getTime()) || (plan.mode === 'refresh' && checks.some(value => localTime(value).hour < 11))) fail('Both real checks must belong to the scheduled daily cycle');
  if (plan.mode === 'adopt' && (!isDeepStrictEqual(bytes,before) || stateBefore)) fail('Migration may only adopt the unchanged existing pair');
  const state = {version:1,day:plan.day,status:'committed',origin:plan.mode === 'adopt' ? 'adopted' : 'verified',committedAt:at.toISOString(),rateHashes:hashPair(bytes)};
  fs.writeFileSync(path.join(cwd,STATE),JSON.stringify(state,null,2)+'\n');
  return writeAndPush(cwd,plan.base,[...allowed,STATE],'Freeze verified property payment rates for '+plan.day,assertTime);
}
function pendingTarget({cwd, now, clock = () => now || new Date()}) {
  const started = localTime(clock());
  if (started.hour < 11) fail('No publication before 11:00 Moscow');
  const base = remoteHead(cwd);
  fastForward(cwd,base);
  const at = clock();
  if (localTime(at).day !== started.day || localTime(at).hour < 11) fail('Publication crossed its authorized Moscow date');
  const bytes = pairAt(cwd,base), state = readState(cwd,base);
  validateState(cwd,base,state,bytes,at);
  if (!state) fail('Missing committed daily state');
  if (state.status === 'published') return null;
  const revision = git(cwd,'log','-1','--format=%H',base,'--',STATE);
  if (!/^[a-f0-9]{40}$/.test(revision) || !isDeepStrictEqual(hashPair(pairAt(cwd,revision)),state.rateHashes)) fail('Missing authoritative frozen revision');
  return {day:state.day,authorizedDay:started.day,base,revision,rateHashes:state.rateHashes,values:validatePair(bytes,at).values,committedAt:state.committedAt};
}
function assertReaderAllowed({cwd,plan,now,clock = () => now || new Date()}) {
  const at = clock();
  if (!plan || plan.mode !== 'refresh' || eligibility({...plan,now:at}) || plan.day !== localTime(at).day) fail('A source reader requires the approved daily cycle plan');
  const base = remoteHead(cwd);
  if (base !== plan.base || git(cwd,'rev-parse','HEAD') !== base) fail('Source reader has a stale cycle checkout');
  const bytes = pairAt(cwd,base), state = readState(cwd,base), pair = validatePair(bytes,at);
  validateState(cwd,base,state,bytes,at);
  if (state?.status === 'committed' || dayLocked(state,plan.day)
    || (!state && (pair.cbrDay === plan.day || pair.bankDay === plan.day))) fail('This day is already frozen or needs migration');
  if (eligibility({...plan,now:clock()})) fail('Source reader crossed its authorized Moscow date');
}
function buildMatches(cwd,target,build) {
  try {return build?.status === 'built' && /^[a-f0-9]{40}$/.test(build.commit)
    && isAncestor(cwd,target.revision,build.commit) && isAncestor(cwd,build.commit,target.base)
    && isDeepStrictEqual(hashPair(pairAt(cwd,build.commit)),target.rateHashes);} catch {return false;}
}
async function confirmPublication({cwd,target,getLatestBuild,requestBuild,readLivePair,wait = ms => new Promise(resolve => setTimeout(resolve,ms)),now = () => new Date(),attempts = 30,delayMs = 10000}) {
  let requested = false;
  const assertTime = () => {
    const at = localTime(now());
    if (at.hour < 11 || at.day !== target.authorizedDay) fail('Publication crossed its authorized Moscow date or is before 11:00');
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    assertTime();
    // Failure to establish Pages state is fail-closed, never a blind new POST.
    const build = await getLatestBuild();
    if (buildMatches(cwd,target,build)) {
      try {
        const live = await readLivePair(target.revision);
        if (isDeepStrictEqual(live,target.values)) {
          assertTime();
          const proof = Object.freeze({rateRevision:target.revision,publishedRevision:build.commit,confirmedAt:now().toISOString(),rateHashes:target.rateHashes});
          verifiedProofs.add(proof); return proof;
        }
      } catch { /* The next observation must still prove both live JSONs. */ }
    } else if (!requested && !['building','queued'].includes(build?.status)) {
      assertTime();
      requested = true;
      try {await requestBuild();} catch { /* A POST timeout is uncertain: observe, never blindly repeat. */ }
    }
    if (attempt + 1 < attempts) await wait(delayMs);
  }
  fail('Daily set is frozen in Git; Pages/live publication remains unconfirmed');
}
function acknowledge({cwd,target,proof,now,clock = () => now || new Date()}) {
  if (!verifiedProofs.has(proof) || !isDeepStrictEqual(proof.rateHashes,target.rateHashes) || proof.rateRevision !== target.revision) fail('Only a verified live publication can be acknowledged');
  const assertTime = () => {
    const at = clock();
    if (localTime(at).hour < 11 || localTime(at).day !== target.authorizedDay) fail('Acknowledgement crossed its authorized Moscow date');
    return at;
  };
  assertTime();
  const pending = pendingTarget({cwd,clock});
  if (!pending) return null;
  if (pending.revision !== target.revision || !isDeepStrictEqual(pending.rateHashes,target.rateHashes)) fail('Frozen set changed before acknowledgement');
  if (!isAncestor(cwd,proof.publishedRevision,pending.base) || !timestamp(proof.confirmedAt)
    || Date.parse(proof.confirmedAt) < Date.parse(pending.committedAt) || Date.parse(proof.confirmedAt) > assertTime().getTime()) fail('Invalid live publication proof');
  const state = readState(cwd,pending.base);
  Object.assign(state,{status:'published',rateRevision:target.revision,publishedRevision:proof.publishedRevision,confirmedAt:proof.confirmedAt,completedDay:localTime(proof.confirmedAt).day});
  fs.writeFileSync(path.join(cwd,STATE),JSON.stringify(state,null,2)+'\n');
  return writeAndPush(cwd,pending.base,[STATE],'Confirm live property payment rates for '+target.day,assertTime);
}
module.exports = {FILES,STATE,CRONS,localTime,prepare,commitPair,pendingTarget,confirmPublication,acknowledge,assertReaderAllowed,validatePair};
if (require.main === module) {
  try {
    if (process.argv[2] !== 'check-reader' || !process.env.THAIPAY_CYCLE_PLAN) fail('Missing approved daily cycle plan');
    const plan = parse(fs.readFileSync(process.env.THAIPAY_CYCLE_PLAN,'utf8'),'cycle plan');
    assertReaderAllowed({cwd:process.cwd(),plan});
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
