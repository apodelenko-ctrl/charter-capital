# Charter Flow

Институциональный клиентский дашборд для мониторинга сделок по договору займа
`USDT-RUR/VDT-KMK-1/21042026`. Стек: **React (Vite) + Tailwind CSS + Framer Motion + lucide-react**.

Стиль — «банковский терминал» в Dark Mode, акцент — золото (`#D4AF37`).

---

## Структура проекта

```
charter-flow/
├── public/
│   ├── favicon.svg
│   └── docs/                              # PDF-документы для скачивания
├── src/
│   ├── components/
│   │   ├── StatusHeader/                  # Шапка: лого + статус сделки
│   │   ├── FlowChart/                     # Финансовый поток (4 узла + потоки)
│   │   ├── TrancheTable/                  # Таблица траншей (адаптивная)
│   │   ├── DocumentSection/               # Кнопки скачивания PDF
│   │   └── ui/                            # Card, SectionTitle
│   ├── config/
│   │   └── data.js                        # ★ Единый источник данных
│   ├── hooks/
│   │   └── useReducedMotion.js
│   ├── styles/
│   │   └── tokens.css                     # Дизайн-токены
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── package.json
```

---

## Запуск

```bash
cd charter-flow
npm install
npm run dev
```

Откроется на `http://localhost:5173/charter-flow/` (см. `base` в `vite.config.js`).

Сборка: `npm run build` → `dist/`.
Превью сборки: `npm run preview`.

---

## Как редактировать данные

Все данные — в одном файле:

**`src/config/data.js`**

| Что меняем | Где |
|---|---|
| Номер договора, статус сделки | `deal` |
| Стороны (фондирующая сторона, банк, клиент) | `parties` |
| Узлы финансового потока (4 шага) | `flowNodes` |
| Транши (массив строк таблицы) | `tranches` |
| Документы для скачивания | `documents` |

Статус сделки в шапке — одно из:
- `DEAL_STATUS.ACTIVE_TRANCHE` — «Активный транш» (золото, пульсация)
- `DEAL_STATUS.PROCESSING` — «В обработке» (голубой, пульсация)
- `DEAL_STATUS.COMPLETED` — «Завершено» (зелёный)

Статус транша — `TRANCHE_STATUS.COMPLETED | ACTIVE | PROCESSING | PENDING`.

---

## Документы

Положите PDF-файлы в `public/docs/`:
- `prilozhenie-6-akt-zaloga.pdf`
- `prilozhenie-7-akt-vzyskaniya.pdf`

Имена/пути меняются в `data.js → documents`.

---

## Адаптивность

- **md+ (≥ 768px)**: финансовый поток горизонтально, таблица траншей в табличном виде
- **mobile (< 768px)**: поток вертикально, транши — карточками

---

## Анимации

Используется **Framer Motion**:
- Появление секций (stagger по `delay`)
- Бегущие частицы между узлами FlowChart
- Hover-эффекты на кнопках скачивания и узлах потока
- Tooltip на узле «Internal Settlement» (формула `Курс MOEX + 3 RUB`)

Уважается `prefers-reduced-motion` через хук `useReducedMotion`.

---

## Деплой в подпапку `charter-capital`

В `vite.config.js` уже стоит `base: '/charter-flow/'`.
После `npm run build` содержимое `dist/` положите в `charter-flow/` рядом с основным сайтом — относительные пути будут работать.

Для standalone-хостинга измените `base: '/'` в `vite.config.js`.
