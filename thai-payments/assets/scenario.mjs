const currencies = new Set(['RUB', 'USDT']);
const methods = new Set(['all', 'bank', 'cash']);
const views = new Set(['table', 'cards']);

export function parseAmount(value) {
  const clean = String(value ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(clean)) return null;
  const number = Number(clean);
  return Number.isFinite(number) && number >= .01 && number <= 1e9 ? number : null;
}

export function readScenario(search) {
  const params = new URLSearchParams(search);
  const rawCurrency = params.get('currency');
  const currency = currencies.has(rawCurrency) ? rawCurrency : 'RUB';
  const rawMethod = params.get('method');
  const method = currency === 'RUB' && methods.has(rawMethod) ? rawMethod : 'all';
  return {
    currency, method,
    view: views.has(params.get('view')) ? params.get('view') : 'table',
    amount: parseAmount(params.get('usd')),
    hasAmount: params.has('usd'),
  };
}

export function scenarioUrl(base, scenario) {
  const amount = parseAmount(scenario.amount);
  if (amount === null || !currencies.has(scenario.currency)) return null;
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  // Share only calculator parameters, never auth or unrelated query strings.
  url.search = '';
  url.hash = '';
  url.searchParams.set('usd', String(amount));
  url.searchParams.set('currency', scenario.currency);
  if (scenario.currency === 'RUB' && methods.has(scenario.method) && scenario.method !== 'all') url.searchParams.set('method', scenario.method);
  if (scenario.view === 'cards') url.searchParams.set('view', 'cards');
  return url.href;
}
