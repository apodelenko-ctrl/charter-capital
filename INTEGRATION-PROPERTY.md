# CP Property — задание на интеграцию

> Модуль **CP Property** (Phuket real estate desk) уже добавлен в репозиторий
> commit `6a625bf`. Остался один шаг — подключить в навигацию.

---

## 0. Что уже лежит в репо (проверь — это ЕСТЬ)

| Путь | Назначение |
|---|---|
| `property.html` | RU основная страница (lang=ru) — каталог из 5 проектов, карта Пхукета, mechanics, FAQ, форма |
| `property-en.html` | EN зеркало с переключателем RU |
| `projects/_passport.css` | Общие стили паспортов проектов |
| `projects/the-modeva.html` + `the-modeva-en.html` | RU + EN паспорт The Modeva (Bang Tao) |
| `projects/the-title-artrio.html` + `-en.html` | The Title Artrio (Bang Tao) |
| `projects/the-title-katabello.html` + `-en.html` | The Title Katabello (Kata · Karon) |
| `projects/the-title-adora.html` + `-en.html` | The Title Adora (Bang Tao) |
| `projects/title-vivi.html` + `-en.html` | Title Vivi (Layan) |
| `assets/property/*.jpg` | 33 фото проектов (экстерьеры, интерьеры, планировки) |

**Все пути уже на ccapital.pro** — внутри файлов нет ссылок на wegc.fund, wet-agency, и т.д.
**Дизайн** — единая система с homeland.html / index.html (Inter light, palette ink/cream/dark, gold #a08156 как accent именно для Property модуля).
**Брендинг** — везде "CP Property · Charter Capital".
**Контакт** — `property@ccapital.pro`, WhatsApp `+66 65 765 8782`, Telegram `@charter_capital`, форма Formspree (тот же endpoint что был на старой агентской странице).

---

## 1. Подключить пункт «Недвижимость» в навигации (5 файлов)

В каждой странице ниже нужно добавить **один новый пункт `<a href="property.html">Недвижимость</a>`** в `<nav class="topbar-nav">`.

### 1.1 `index.html`

Найти:
```html
<nav class="topbar-nav">
  <a href="#triggers">Боль</a>
  <a href="#routes">Маршруты</a>
  <a href="#scoring">Скоринг</a>
  <a href="#boundaries">Границы</a>
  <a href="#contact">Связаться</a>
</nav>
```

Заменить на:
```html
<nav class="topbar-nav">
  <a href="#triggers">Боль</a>
  <a href="#routes">Маршруты</a>
  <a href="#scoring">Скоринг</a>
  <a href="#boundaries">Границы</a>
  <a href="property.html">Недвижимость</a>
  <a href="#contact">Связаться</a>
</nav>
```

### 1.2 `homeland.html`

Найти:
```html
<nav class="topbar-nav">
  <a href="#cash">Деньги</a>
  <a href="#docs">Документы</a>
  <a href="#legal">ФССП</a>
  <a href="#legends">Легенды</a>
  <a href="#more">Ещё</a>
  <a href="index.html">Уже за&nbsp;границей →</a>
</nav>
```

Заменить на:
```html
<nav class="topbar-nav">
  <a href="#cash">Деньги</a>
  <a href="#docs">Документы</a>
  <a href="#legal">ФССП</a>
  <a href="#legends">Легенды</a>
  <a href="#more">Ещё</a>
  <a href="property.html">Недвижимость</a>
  <a href="index.html">Уже за&nbsp;границей →</a>
</nav>
```

### 1.3 `fund.html`

Найти:
```html
<nav class="topbar-nav">
  <a href="#how">Как работает</a>
  <a href="#programs">Стратегии</a>
  <a href="#examples">Расчёт</a>
  <a href="#objects">Объекты</a>
  <a href="#protect">Защита</a>
  <a href="#faq">FAQ</a>
  <a href="#contact">Контакт</a>
</nav>
```

Заменить на:
```html
<nav class="topbar-nav">
  <a href="#how">Как работает</a>
  <a href="#programs">Стратегии</a>
  <a href="#examples">Расчёт</a>
  <a href="#objects">Объекты</a>
  <a href="#protect">Защита</a>
  <a href="property.html">Недвижимость</a>
  <a href="#faq">FAQ</a>
  <a href="#contact">Контакт</a>
</nav>
```

### 1.4 `private.html`

Найти:
```html
<nav class="topbar-nav">
  <a href="#diagnosis">Диагноз</a>
  <a href="#path-map">Маршрут</a>
  <a href="#hubs">Хабы</a>
  <a href="#engagement">Формы</a>
  <a href="#boundaries">Границы</a>
  <a href="#contact">Контакт</a>
</nav>
```

Заменить на:
```html
<nav class="topbar-nav">
  <a href="#diagnosis">Диагноз</a>
  <a href="#path-map">Маршрут</a>
  <a href="#hubs">Хабы</a>
  <a href="#engagement">Формы</a>
  <a href="#boundaries">Границы</a>
  <a href="property.html">Недвижимость</a>
  <a href="#contact">Контакт</a>
</nav>
```

### 1.5 `freedom-route.html`

Найти:
```html
<nav class="topbar-nav">
  <a href="#idea">Идея</a>
  <a href="#freedom">Свобода</a>
  <a href="#route">Маршрут</a>
  <a href="#cases">Ситуации</a>
  <a href="#private" class="is-gold">Private Office</a>
  <a href="#contact">Контакт</a>
</nav>
```

Заменить на:
```html
<nav class="topbar-nav">
  <a href="#idea">Идея</a>
  <a href="#freedom">Свобода</a>
  <a href="#route">Маршрут</a>
  <a href="#cases">Ситуации</a>
  <a href="#private" class="is-gold">Private Office</a>
  <a href="property.html">Недвижимость</a>
  <a href="#contact">Контакт</a>
</nav>
```

---

## 2. Опционально — карточка-промо в `index.html`

Если у `index.html` есть секция «Маршруты» или похожая сетка карточек других модулей (Fund, Homeland Prep, Private Office), добавить туда карточку **CP Property** с переходом на `/property.html`. Скопировать стиль существующих карточек — не выдумывать новый.

Текст карточки на русском:

> **CP Property — Phuket**
> Курируемая недвижимость на Пхукете. Прямые контракты с застройщиком. Скрининг GIDR. 5 проектов под покрытием.
> [Открыть →](/property.html)

---

## 3. Сделать после правок

```bash
cd /Users/ktel25/Documents/charter-capital
git status
git diff index.html homeland.html fund.html private.html freedom-route.html
git add index.html homeland.html fund.html private.html freedom-route.html
git commit -m "Wire CP Property module into top navigation across all sections."
git push origin main
```

После пуша проверить:
- [https://ccapital.pro/property.html](https://ccapital.pro/property.html) — RU
- [https://ccapital.pro/property-en.html](https://ccapital.pro/property-en.html) — EN
- Кликнуть «Недвижимость» из шапки на каждой странице → должна открываться `property.html`
- На property открыть любую карточку проекта → паспорт должен загрузиться, фото видны (`/assets/property/*.jpg`)
- Переключатель `EN`/`RU` в правом углу шапки property + любого паспорта → должен переводить между версиями

---

## 4. Известное состояние и что НЕ трогать

- Внутри `property.html` / `property-en.html` и `projects/*.html` **уже** правильно настроены `canonical`, `og:url`, `og:image`, `hreflang`, переключатель языка. Не править.
- `assets/property/` — закоммичено в репо (33 jpg файла, около 4 МБ).
- `projects/_passport.css` — общий стилевой файл для всех 10 паспортов. Не дублировать.
- Форма обратной связи на property — Formspree endpoint `https://formspree.io/f/xrbyywrr`. Если нужно — поменять на свой, но не обязательно.

---

## 5. Контакты для уточнений

Если что-то не очевидно:
- Источник правды: `https://wegc.fund/wet-agency.html` (RU) и `https://wegc.fund/wet-agency-en.html` (EN) — там та же страница в более раннем хостинге.
- Источник кода: `https://github.com/apodelenko-ctrl/WEGC` — папки `/projects/` и файл `wet-agency.html` / `wet-agency-en.html`.

Готово.
