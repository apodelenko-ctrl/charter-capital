(function () {
  'use strict';
  var form = document.getElementById('leadForm');
  var button = form.querySelector('button[type="submit"]');
  var status = document.getElementById('leadStatus');
  var liveHost = window.location.protocol === 'https:' && window.location.hostname === 'ccapital.pro';
  var endpoint = form.dataset.endpoint;
  var submissionsEnabled = form.dataset.submitEnabled === 'true';
  var buttonLabel = 'Получить расчёт ↗';
  var busy = false;
  var labels = { name: 'Имя / компания', contact: 'Контакт', project: 'Застройщик и объект сделки' };

  // Local/file previews cannot send to the external receiver, including native form submission.
  form.action = liveHost && submissionsEnabled ? endpoint : '#lead';
  if (!submissionsEnabled) {
    button.disabled = true;
    button.textContent = 'Отправка временно недоступна';
  }
  form.addEventListener('input', function (event) {
    if (event.target.setCustomValidity) event.target.setCustomValidity('');
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    if (!submissionsEnabled) {
      status.hidden = false;
      status.className = 'form-status';
      status.textContent = 'Приём заявок временно недоступен. Данные не отправлены.';
      return;
    }
    for (var id of Object.keys(labels)) {
      var field = document.getElementById(id);
      field.value = field.value.trim();
      field.setCustomValidity(field.value ? '' : 'Заполните поле «' + labels[id] + '».');
    }
    if (!form.reportValidity()) return;
    status.hidden = false;
    if (!liveHost) {
      status.className = 'form-status';
      status.textContent = 'Локальное превью: данные не отправлены. Форма станет доступна после публикации и подключения приёмника.';
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Отправляем…';
    form.setAttribute('aria-busy', 'true');
    status.className = 'form-status';
    status.textContent = 'Отправляем заявку…';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(endpoint, {
        method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)).toString(), signal: controller.signal,
      });
      var result = await response.json();
      if (!response.ok || result.ok !== true || result.status !== 'submitted' || !/^[a-f0-9-]{36}$/.test(result.reference || '')) {
        var error = new Error('not_confirmed'); error.status = response.status; throw error;
      }
      form.reset();
      status.className = 'form-status success';
      status.textContent = 'Заявка передана системе приёма. После проверки мы свяжемся с вами по указанному контакту. Код заявки: ' + result.reference;
    } catch (error) {
      status.className = 'form-status error';
      status.textContent = error.status === 422
        ? 'Заявка не принята. Проверьте заполненные поля и отправьте снова.'
        : error.status === 429
          ? 'Слишком много запросов. Подождите минуту и попробуйте снова.'
          : 'Не удалось подтвердить приём заявки. Данные сохранены в форме. Если ошибка повторяется, напишите на post@wegc.fund; укажите, что отправка с сайта не была подтверждена.';
    } finally {
      clearTimeout(timer); busy = false; button.disabled = false;
      button.textContent = buttonLabel; form.removeAttribute('aria-busy');
    }
  });
})();
