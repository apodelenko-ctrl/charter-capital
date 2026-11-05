/* No browser, Telegram, Formspree or Cloudflare requests are made by this suite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '../js/forms-telegram.js'), 'utf8');

class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = { ...attrs };
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this.parentNode = null;
    this.parentElement = null;
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this._classes.add(name)),
      remove: (...names) => names.forEach(name => this._classes.delete(name)),
      contains: name => this._classes.has(name),
      toggle: (name, force) => {
        if (force === undefined) force = !this._classes.has(name);
        force ? this._classes.add(name) : this._classes.delete(name);
        return force;
      }
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) {
    child.parentNode = child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  insertBefore(child, reference) {
    child.parentNode = child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = this.parentElement = null;
  }
  focus() { this.focused = true; }
  addEventListener(name, callback) { (this._listeners ??= {})[name] = callback; }
  matches(selector) {
    if (selector === ':disabled') return this.disabled;
    if (selector === '[required]' || selector === ':required') return !!this.required;
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const name = selector.match(/\[name=["']?([^\]"']+)/);
    if (name) return this.name === name[1];
    const type = selector.match(/\[type=["']?([^\]"']+)/);
    if (type) return this.type === type[1];
    if (selector === 'button' || selector === 'input') return this.tagName === selector.toUpperCase();
    return false;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(part => part.trim());
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return all.filter(child => selector === '*' || selectors.some(part => child.matches(part)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Field extends Element {
  constructor(name, value = '', attrs = {}) {
    super(attrs.tag || 'input');
    Object.assign(this, { name, value, type: 'text', required: false, checked: true }, attrs);
    this.customValidation = '';
  }
  setCustomValidity(message) { this.customValidation = message; }
  checkValidity() {
    if (this.disabled || this.type === 'hidden') return true;
    if (this.customValidation) return false;
    if (this.required && (this.type === 'checkbox' ? !this.checked : !this.value)) return false;
    if (this.type === 'email' && this.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value)) return false;
    return true;
  }
  reportValidity() { this.reported = true; return this.checkValidity(); }
}

class FormDataMock {
  constructor(form) {
    this.values = [];
    for (const field of form?.elements || []) {
      if (!field.name || field.disabled || (['checkbox', 'radio'].includes(field.type) && !field.checked)) continue;
      if (field.type === 'file') {
        for (const file of field.files || []) this.values.push([field.name, file]);
      } else this.values.push([field.name, field.value]);
    }
  }
  get(name) { return this.values.find(([key]) => key === name)?.[1] ?? null; }
  getAll(name) { return this.values.filter(([key]) => key === name).map(([, value]) => value); }
  set(name, value) { this.values = this.values.filter(([key]) => key !== name); this.values.push([name, value]); }
  append(name, value) { this.values.push([name, value]); }
  forEach(callback) { this.values.forEach(([key, value]) => callback(value, key, this)); }
  entries() { return this.values[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entries(); }
}

function fixture({ fields = [], action = 'https://formspree.io/f/xrbyywrr', pathname = '/', formId = 'partnerRegisterForm', respond, challengeFailure = false } = {}) {
  const listeners = {};
  const head = new Element('head');
  const body = new Element('body');
  const document = {
    readyState: 'complete', head, body,
    createElement: tag => new Element(tag),
    addEventListener: (name, callback) => (listeners[name] ??= []).push(callback),
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector),
    getElementById: id => body.querySelector('#' + id)
  };
  const form = new Element('form', { action, method: 'POST' });
  form.id = formId;
  form.action = action;
  form.method = 'POST';
  form.elements = fields;
  fields.forEach(field => { field.form = form; form.appendChild(field); });
  body.appendChild(form);
  form.checkValidity = () => fields.every(field => field.checkValidity());
  form.reportValidity = () => { form.reported = true; return form.checkValidity(); };
  form.reset = () => fields.forEach(field => { if (field.type !== 'hidden') field.value = ''; });
  const submitter = new Element('button');
  submitter.type = 'submit';
  submitter.form = form;
  submitter.textContent = 'Отправить заявку';
  form.appendChild(submitter);
  let downstream = 0;
  let replaySubmitter;
  function dispatch(chosenSubmitter = submitter) {
    const event = {
      target: form, submitter: chosenSubmitter, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      stopPropagation() { this.stopped = true; }
    };
    for (const callback of listeners.submit || []) {
      callback(event);
      if (event.stopped) break;
    }
    if (!event.stopped) { downstream++; replaySubmitter = chosenSubmitter; }
    return event;
  }
  form.requestSubmit = chosenSubmitter => dispatch(chosenSubmitter);
  form.submit = () => { downstream++; };
  const requests = [];
  const turnstile = {
    options: [], executed: [], removed: [],
    render(container, options) { this.options.push(options); return 'widget-' + this.options.length; },
    execute(id) {
      this.executed.push(id);
      const options = this.options[Number(id.split('-')[1]) - 1];
      if (challengeFailure) options['error-callback']('challenge-failed');
      else options.callback('verified-token-' + this.executed.length);
    },
    remove(id) { this.removed.push(id); }
  };
  const fetch = async (url, options) => {
    const request = { url, options, payload: JSON.parse(options.body) };
    requests.push(request);
    return respond ? respond(request, requests.length) : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const location = { pathname, href: 'https://ccapital.pro' + pathname, hash: '', origin: 'https://ccapital.pro' };
  const window = { fetch, FormData: FormDataMock, turnstile, location, addEventListener() {} };
  const context = vm.createContext({
    window, document, location, fetch, FormData: FormDataMock,
    URL, URLSearchParams, WeakMap, WeakSet, Map, Set, Promise, Date, AbortController,
    setTimeout, clearTimeout, console,
    crypto: require('node:crypto').webcrypto,
    sessionStorage: { setItem() {} }
  });
  vm.runInContext(script, context, { filename: 'forms-telegram.js' });
  return { form, fields, submitter, dispatch, requests, turnstile, document, window,
    get downstream() { return downstream; }, get replaySubmitter() { return replaySubmitter; } };
}

function partner(overrides = {}) {
  const fields = [
    new Field('form_source', 'partner_access_modal', { type: 'hidden' }),
    new Field('_subject', 'Private Access', { type: 'hidden' }),
    new Field('_gotcha', ''),
    new Field('email', 'person@example.com', { type: 'email', required: true }),
    new Field('full_name', 'Test Person', { required: true }),
    new Field('company', 'Company'),
    new Field('phone', ''),
    new Field('telegram', ''),
    new Field('contact_channel', 'Email', { tag: 'select', required: true }),
    new Field('privacy_agree', 'yes', { type: 'checkbox', checked: true, required: true })
  ];
  for (const [name, value] of Object.entries(overrides)) {
    const field = fields.find(field => field.name === name);
    if (name === 'privacy_agree') field.checked = value; else field.value = value;
  }
  return fields;
}

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

test('empty required fields never reach Turnstile, relay or downstream handler', async () => {
  const app = fixture({ fields: partner({ email: '', full_name: '', contact_channel: '' }) });
  assert.equal(app.dispatch().defaultPrevented, true);
  await settle();
  assert.equal(app.requests.length, 0);
  assert.equal(app.turnstile.executed.length, 0);
  assert.equal(app.downstream, 0);
});

test('trimmed required text, malformed email and unchecked consent each block sending', async t => {
  for (const values of [{ full_name: '   ' }, { email: 'bad-address' }, { privacy_agree: false }]) {
    await t.test(JSON.stringify(values), async () => {
      const app = fixture({ fields: partner(values) });
      app.dispatch();
      await settle();
      assert.equal(app.requests.length, 0);
      assert.equal(app.downstream, 0);
    });
  }
});

test('every honeypot value is checked, including the second duplicate input', async () => {
  const fields = partner();
  fields.push(new Field('_gotcha', 'robot'));
  const app = fixture({ fields });
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 0);
  assert.equal(app.downstream, 0);
});

test('valid submission uses one structured request and replays the original submitter once', async () => {
  const app = fixture({ fields: partner() });
  const event = app.dispatch();
  assert.equal(event.defaultPrevented, true);
  assert.equal(app.downstream, 0, 'existing handlers must wait until relay success');
  await settle();
  assert.equal(app.requests.length, 1);
  const { options, payload } = app.requests[0];
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(payload.source, 'partner_access_modal');
  assert.equal(payload.page, '/');
  assert.equal(payload.fields.full_name, 'Test Person');
  assert.equal(payload.fields.email, 'person@example.com');
  assert.equal(payload.fields.privacy_agree, 'yes');
  assert.ok(payload.token);
  assert.equal(payload.text, undefined, 'browser cannot choose a Telegram message');
  assert.equal(payload.fields._subject, undefined);
  assert.equal(payload.fields.form_source, undefined);
  assert.equal(app.turnstile.options[0].action, 'lead');
  assert.equal(app.downstream, 1);
  assert.equal(app.replaySubmitter, app.submitter);
});

test('rapid duplicate clicks while request is pending cannot send or replay twice', async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const app = fixture({ fields: partner(), respond: () => pending });
  app.dispatch();
  await settle();
  app.dispatch();
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 1);
  assert.equal(app.downstream, 0);
  complete({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await settle();
  assert.equal(app.downstream, 1);
});

test('editing fields while delivery is pending cannot replay different data to Formspree', async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const app = fixture({ fields: partner(), respond: () => pending });
  app.dispatch();
  await settle();
  app.fields.find(field => field.name === 'company').value = 'Changed while sending';
  complete({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await settle();
  assert.equal(app.requests[0].payload.fields.company, 'Company');
  assert.equal(app.downstream, 0);
  assert.match(app.form.querySelector('.cc-form-status')?.textContent, /изменились/i);
});

test('relay failure stays on the form, removes challenge, and permits a fresh retry', async () => {
  const app = fixture({ fields: partner(), respond: (_request, count) => ({
    ok: count > 1, status: count > 1 ? 200 : 503,
    json: async () => ({ ok: count > 1 })
  }) });
  app.dispatch();
  await settle();
  assert.equal(app.downstream, 0);
  assert.ok(app.form.querySelector('.cc-form-status')?.textContent);
  assert.ok(app.turnstile.removed.length > 0);
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 2);
  assert.equal(app.downstream, 1);
});

test('HTTP 200 with ok:false cannot replay the original handler', async () => {
  const app = fixture({ fields: partner(), respond: () => ({ ok: true, status: 200, json: async () => ({ ok: false }) }) });
  app.dispatch();
  await settle();
  assert.equal(app.downstream, 0);
});

test('a failed Turnstile challenge blocks both network delivery and the existing handler', async () => {
  const app = fixture({ fields: partner(), challengeFailure: true });
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 0);
  assert.equal(app.downstream, 0);
  assert.ok(app.form.querySelector('.cc-form-status')?.textContent);
});

test('unchanged successful form can retry Formspree without a duplicate Telegram delivery', async () => {
  const app = fixture({ fields: partner() });
  app.dispatch();
  await settle();
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 1);
  assert.equal(app.downstream, 2);
  app.fields.find(field => field.name === 'company').value = 'Changed company';
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 2, 'edited application must be sent as new content');
  assert.equal(app.downstream, 3);
});

test('unrelated forms and lookalike Formspree domains do not invoke the relay', async () => {
  for (const action of ['/login', 'https://formspree.io.attacker.example/f/123']) {
    const app = fixture({ fields: partner(), action });
    app.dispatch();
    await settle();
    assert.equal(app.requests.length, 0);
    assert.equal(app.downstream, 1);
  }
});

test('company form without legacy source is assigned its fixed known source', async () => {
  const app = fixture({ pathname: '/company.html', formId: 'companyForm', fields: [
    new Field('name', 'Test Person', { required: true }),
    new Field('email', 'person@example.com', { required: true, type: 'email' }),
    new Field('agree', 'on', { required: true, type: 'checkbox' })
  ] });
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].payload.source, 'company_intake');
  assert.equal(app.downstream, 1);
});

test('attachment metadata contains filename only and unknown fields cannot choose delivery settings', async () => {
  const fields = [
    new Field('form_source', 'pay_lite_intake', { type: 'hidden' }),
    new Field('email', 'person@example.com', { type: 'email' }),
    new Field('file', '', { type: 'file', files: [{ name: 'invoice.pdf', bytes: 'PRIVATE-FILE-BYTES', size: 123 }] }),
    new Field('chat_id', 'attacker-chat'),
    new Field('text', 'hello 1'),
    new Field('unknown_field', 'untrusted')
  ];
  const app = fixture({ pathname: '/pay.html', fields });
  app.dispatch();
  await settle();
  assert.equal(app.requests.length, 1);
  const payload = app.requests[0].payload;
  assert.equal(payload.fields.file, 'invoice.pdf');
  assert.equal(payload.fields.chat_id, undefined);
  assert.equal(payload.fields.text, undefined);
  assert.equal(payload.fields.unknown_field, undefined);
  assert.equal(JSON.stringify(payload).includes('PRIVATE-FILE-BYTES'), false);
});

