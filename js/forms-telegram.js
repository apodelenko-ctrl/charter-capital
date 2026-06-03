/*!
 * Charter Capital · Forms-to-Telegram delivery
 * --------------------------------------------
 * Глобальный capture-перехватчик SUBMIT-событий на всех формах сайта.
 * Параллельно с основной доставкой (Formspree) шлёт копию заявки в Telegram-бот.
 * Не модифицирует существующую логику форм — работает поверх неё.
 *
 * Архитектура:
 *   - Перехватываем submit в capture-фазе (срабатывает ДО existing handlers)
 *   - Собираем FormData (значения полей ещё на месте)
 *   - Шлём ТЕКСТ заявки на Cloudflare Worker-прокси (он добавляет токен и
 *     пересылает в Telegram). Токена в этом файле больше нет.
 *   - Existing handler продолжает работать как был (Formspree, success UI, etc)
 *
 * Telegram-бот: @ccapital_forms_bot
 * Канал доставки: личка @artpoland25 (chat_id 8085530280) — задаётся в воркере
 *
 * Безопасность:
 *   Токен бота хранится ТОЛЬКО в секрете воркера (env.TG_TOKEN), не в этом JS.
 *   Поэтому токен нельзя выскрести из исходников сайта и угнать/переименовать
 *   бота. Деплой воркера: см. cloudflare-worker/README.md
 */
(function () {
  if (!window.fetch || !window.FormData) return;

  /* URL задеплоенного воркера. После `wrangler deploy` вставьте сюда выданный
     адрес вида https://ccapital-forms-proxy.<субдомен>.workers.dev
     Пока стоит плейсхолдер — доставка в Telegram просто отключена (Formspree
     работает в любом случае). */
  var PROXY_URL = 'https://ccapital-forms-proxy.wegc.workers.dev';

  /* Маппинг form_source → иконка + читаемое имя */
  var SOURCE_META = {
    'pay_usdc_b2b':         { icon: '💼', title: 'Pay · USDC B2B' },
    'pay_lite_intake':      { icon: '⚡', title: 'Pay Lite' },
    'pay_pro_intake':       { icon: '🎯', title: 'Pay Pro' },
    'partner_access_modal': { icon: '🔐', title: 'Private Access' },
    'property_ru':          { icon: '🏠', title: 'Property · RU' },
    'property_en':          { icon: '🏠', title: 'Property · EN' },
    'slovakia_intake':      { icon: '🇸🇰', title: 'Slovakia · ВНЖ/ПМЖ/паспорт' }
  };

  /* Технические имена полей → читаемые лейблы (по реальной схеме форм сайта) */
  var LABELS = {
    /* Общие */
    'name':              'Имя',
    'full_name':         'ФИО',
    'contact':           'Контакт',
    'phone':             'Телефон',
    'email':             'Email',
    'tg':                'Telegram',
    'telegram':          'Telegram',
    'messenger':         'Telegram / WhatsApp',
    'company':           'Компания',
    'message':           'Сообщение',
    'comment':           'Комментарий',
    'note':              'Комментарий',
    'msg':               'Что важно понять',
    'description':       'Описание',
    'desc':              'Описание',
    'subject':           'Тема',
    'country':           'Страна',
    'city':              'Город',
    'language':          'Язык',
    'role':              'Роль',
    'about':             'О себе',
    'budget':            'Бюджет',
    'amount':            'Сумма',
    'currency':          'Валюта',
    'case_id':           'CASE',
    'flow':              'Тариф',
    'file':              'Файл',

    /* Pay USDC */
    'supplier_country':  'Страна поставщика',

    /* Pay Lite / Pro */
    'jurisdiction':      'Юрисдикция компании',
    'reg_id':            'ИНН / Reg. number',
    'benef_country':     'Страна получателя',
    'benef_name':        'Получатель',
    'benef_type':        'Тип получателя',
    'principal_country': 'Страна вашей компании',
    'purpose':           'Назначение платежа',
    'invoice':           'Инвойс',
    'contract':          'Контракт',
    'route_used':        'Маршрут',
    'bank_q':            'Банк-получатель готов',
    'docs_have':         'Имеющиеся документы',
    'deadline':          'Желаемый срок',
    'task':              'Описание задачи',

    /* Property RU/EN */
    'object_type':       'Тип объекта',
    'project':           'Проект',
    'agree':             'Согласие на обработку',

    /* Slovakia */
    'citz':              'Гражданство',
    'where':             'Где сейчас живёт',
    'biz':               'Бизнес / источник дохода',
    'rev':               'Годовой оборот',
    'prof':              'Профессия',
    'emp':               'Оффер от SK-работодателя',
    'roots':             'Предки в ЧСФР / SK',
    'docs':              'Документы',
    'fam':               'С семьёй',
    'when':              'Когда начать',

    /* Private Access (старые legacy-имена ID-полей на случай) */
    'paName':            'ФИО',
    'paEmail':           'Email',
    'paPhone':           'Телефон',
    'paCompany':         'Компания'
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function buildMessage(form) {
    var fd = new FormData(form);
    var source = String(fd.get('form_source') || 'unknown');
    var meta = SOURCE_META[source] || { icon: '📩', title: 'Заявка с сайта' };
    var subject = String(fd.get('_subject') || '');

    var lines = [];
    lines.push(meta.icon + ' <b>Новая заявка — ' + escapeHtml(meta.title) + '</b>');
    lines.push('');
    if (subject) {
      lines.push('📋 <i>' + escapeHtml(subject) + '</i>');
      lines.push('');
    }

    var hasFields = false;
    fd.forEach(function (v, k) {
      if (v == null || v === '') return;
      if (k.charAt(0) === '_') return;            // _subject, _gotcha
      if (k === 'form_source') return;
      if (typeof v === 'object') {                // файл
        if (v && v.name) {
          lines.push('📎 <b>Файл:</b> ' + escapeHtml(v.name) + ' (пришлите в TG для пересылки)');
          hasFields = true;
        }
        return;
      }
      var label = LABELS[k] || k;
      lines.push('<b>' + escapeHtml(label) + ':</b> ' + escapeHtml(v));
      hasFields = true;
    });

    if (!hasFields) {
      lines.push('<i>(пустая форма — проверь HTML)</i>');
    }

    lines.push('');
    lines.push('🌐 <a href="' + escapeHtml(location.href) + '">' + escapeHtml(location.pathname + location.hash) + '</a>');
    try {
      lines.push('🕐 ' + new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК');
    } catch (_) {
      lines.push('🕐 ' + new Date().toISOString());
    }

    return lines.join('\n');
  }

  function sendTelegram(text) {
    /* Плейсхолдер не заменён — воркер ещё не подключён. Тихо выходим:
       Formspree доставит заявку в любом случае. */
    if (!PROXY_URL || PROXY_URL === 'REPLACE_WITH_WORKER_URL') {
      return Promise.resolve();
    }
    /* Шлём только text. Токен и chat_id добавляет воркер на сервере.
       URLSearchParams (application/x-www-form-urlencoded) — это CORS simple
       request: нет preflight (~200ms экономии), нет конфликта с Safari WebKit
       keepalive-багом. */
    var params = new URLSearchParams();
    params.append('text', text);
    try {
      return fetch(PROXY_URL, {
        method: 'POST',
        body: params
      }).then(function (r) {
        if (!r.ok) {
          /* Сохраняем ошибку в sessionStorage для дебага (не блокируя UI) */
          try {
            r.text().then(function (t) {
              sessionStorage.setItem('tg_forms_last_error', JSON.stringify({
                status: r.status,
                body: (t || '').slice(0, 500),
                at: new Date().toISOString()
              }));
            });
          } catch (_) { /* no-op */ }
        }
        return r;
      });
    } catch (_) {
      return Promise.resolve();
    }
  }

  function isFormspreeForm(form) {
    var action = String(form.getAttribute('action') || '');
    return /formspree\.io/.test(action);
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (!isFormspreeForm(form)) return;

    var honey = form.querySelector('[name="_gotcha"]');
    if (honey && honey.value) return;

    try {
      var text = buildMessage(form);
      sendTelegram(text).catch(function () { /* no-op */ });
    } catch (_) { /* no-op */ }
  }, true);
})();
