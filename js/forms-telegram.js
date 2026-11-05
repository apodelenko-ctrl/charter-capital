/* Charter Capital: validate first, verify Turnstile, then deliver a structured lead.
 * Bot credentials and message formatting exist only in the Worker.
 */
(function () {
  'use strict';
  if (window.CharterForms || !window.fetch || !window.FormData) return;
  var PROXY_URL = 'https://ccapital-forms-proxy.wegc.workers.dev';
  var SITEKEY = '0x4AAAAAAF0SDEmOhTv2w7IZ';
  var FIELDS = {
    partner_access_modal: 'email full_name company phone telegram contact_channel privacy_agree',
    property_ru: 'name email phone budget project message agree',
    property_en: 'name email phone budget project message agree',
    pay_usdc_b2b: 'name contact supplier_country',
    pay_lite_intake: 'company jurisdiction reg_id contact messenger email benef_country benef_name amount currency purpose invoice file deadline comment',
    pay_pro_intake: 'task amount currency principal_country benef_country benef_type contract invoice route_used bank_q docs_have messenger email deadline comment',
    slovakia_intake: 'name contact citz where biz rev prof emp roots docs fam when msg',
    crypto_exchange_v2: 'amount asset purpose contact task company comment agree',
    company_intake: 'name email goal tg message agree',
    evacuation_intake: 'situation volume contact message'
  };
  var states = new WeakMap();
  var loader;

  function stateFor(form) {
    var state = states.get(form);
    if (!state) { state = {}; states.set(form, state); }
    return state;
  }
  function status(form, message) {
    var node = form.querySelector('.cc-form-status');
    if (!node) {
      node = document.createElement('div');
      node.className = 'cc-form-status';
      node.setAttribute('role', 'alert');
      node.style.cssText = 'margin:12px 0;line-height:1.5;';
      form.appendChild(node);
    }
    node.textContent = message;
  }
  function validate(form) {
    var honey = form.querySelectorAll('[name="_gotcha"]');
    for (var h = 0; h < honey.length; h++) {
      if (String(honey[h].value || '').trim()) return false;
    }
    var fields = form.querySelectorAll('[required], input[type="email"]');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (el.disabled) continue;
      var value = String(el.value || '').trim();
      var empty = el.required && el.type !== 'checkbox' && el.type !== 'radio' && !value;
      var badEmail = el.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (empty || badEmail) {
        status(form, badEmail ? 'Введите корректный email.' : 'Заполните обязательные поля.');
        el.focus();
        return false;
      }
    }
    if (!form.checkValidity()) { form.reportValidity(); return false; }
    return true;
  }
  function payloadFor(form, source) {
    if (!Object.prototype.hasOwnProperty.call(FIELDS, source)) throw new Error('source');
    var allowed = FIELDS[source].split(' ');
    var fields = { _gotcha: '' };
    new FormData(form).forEach(function (value, key) {
      if (allowed.indexOf(key) === -1) return;
      if (typeof value === 'object') value = value && value.name || '';
      fields[key] = String(value).trim();
    });
    return { source: source, page: location.pathname, fields: fields };
  }
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!loader) {
      loader = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        var timer = setTimeout(function () { reject(new Error('challenge_unavailable')); }, 15000);
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = function () { clearTimeout(timer); window.turnstile ? resolve(window.turnstile) : reject(new Error('challenge_unavailable')); };
        script.onerror = function () { clearTimeout(timer); reject(new Error('challenge_unavailable')); };
        document.head.appendChild(script);
      }).catch(function (error) { loader = null; throw error; });
    }
    return loader;
  }
  function challenge(form) {
    return loadTurnstile().then(function (api) {
      return new Promise(function (resolve, reject) {
        var container = document.createElement('div');
        container.className = 'cc-form-challenge';
        form.appendChild(container);
        var widget, settled = false;
        var timer = setTimeout(function () { finish(new Error('challenge_timeout')); }, 60000);
        function finish(error, token) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // Remove asynchronously: callback can fire during render in local mocks.
          Promise.resolve().then(function () {
            try { if (widget !== undefined) api.remove(widget); } catch (_) { /* cleanup only */ }
            container.remove();
          });
          error ? reject(error) : resolve(token);
        }
        try {
          widget = api.render(container, {
            sitekey: SITEKEY, action: 'lead', execution: 'execute', appearance: 'interaction-only',
            'response-field': false,
            callback: function (token) { finish(null, token); },
            'error-callback': function () { finish(new Error('challenge_failed')); },
            'expired-callback': function () { finish(new Error('challenge_expired')); },
            'timeout-callback': function () { finish(new Error('challenge_timeout')); }
          });
          api.execute(widget);
        } catch (error) { finish(error); }
      });
    });
  }
  function submit(form, source) {
    var state = stateFor(form);
    if (state.pending) return state.pending;
    if (!validate(form)) return Promise.reject(new Error('invalid_form'));
    var payload;
    try { payload = payloadFor(form, source); } catch (error) { return Promise.reject(error); }
    var signature = JSON.stringify(payload);
    // An unchanged retry of the secondary Formspree delivery must not notify twice.
    if (state.delivered === signature && Date.now() - state.deliveredAt < 300000) return Promise.resolve();
    status(form, 'Проверка и отправка…');
    form.setAttribute('aria-busy', 'true');
    state.pending = challenge(form).then(function (token) {
      if (JSON.stringify(payloadFor(form, source)) !== signature) throw new Error('form_changed');
      payload.token = token;
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 20000);
      return fetch(PROXY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal
      }).then(function (response) {
        if (!response.ok) throw new Error('delivery_failed');
        return response.json();
      }).then(function (result) {
        if (!result || result.ok !== true) throw new Error('delivery_failed');
        state.delivered = signature;
        state.deliveredAt = Date.now();
        if (JSON.stringify(payloadFor(form, source)) !== signature) throw new Error('form_changed');
        status(form, '');
      }).finally(function () { clearTimeout(timer); });
    }).catch(function (error) {
      status(form, error.message === 'form_changed' ? 'Поля изменились. Проверьте их и отправьте ещё раз.' : 'Не удалось отправить заявку. Повторите попытку или напишите на hello@ccapital.pro.');
      throw error;
    }).finally(function () {
      state.pending = null;
      form.removeAttribute('aria-busy');
    });
    return state.pending;
  }
  window.CharterForms = { submit: submit };

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    var action;
    try { action = new URL(form.getAttribute('action') || '', location.href); } catch (_) { return; }
    if (action.origin !== 'https://formspree.io') return;
    var state = stateFor(form);
    if (state.replay) { state.replay = false; return; }
    var fd = new FormData(form);
    var source = String(fd.get('form_source') || (location.pathname === '/company.html' ? 'company_intake' : ''));
    if (!Object.prototype.hasOwnProperty.call(FIELDS, source)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.pending || !validate(form)) return;
    var submitter = event.submitter;
    submit(form, source).then(function () {
      if (!validate(form)) return;
      state.replay = true;
      try {
        if (submitter && submitter.form === form) form.requestSubmit(submitter);
        else form.requestSubmit();
      } finally { state.replay = false; }
    }).catch(function () { /* visible error is set by submit() */ });
  }, true);
})();
