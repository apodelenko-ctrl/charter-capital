// ============================================================================
// Charter Flow · Единый источник данных
//
// Этот файл — главное место для правок. Меняйте здесь массив траншей,
// статус сделки, стороны и ссылки на документы — верстку трогать не нужно.
// ============================================================================

/**
 * Возможные статусы сделки.
 * Используется для статус-индикатора в шапке.
 */
export const DEAL_STATUS = {
  ACTIVE_TRANCHE: 'active_tranche', // Активный транш
  PROCESSING: 'processing',         // В обработке
  COMPLETED: 'completed',           // Завершено
};

/**
 * Возможные статусы транша (для строк таблицы).
 */
export const TRANCHE_STATUS = {
  COMPLETED: 'Завершено',
  ACTIVE: 'Активный',
  PROCESSING: 'В обработке',
  PENDING: 'Ожидание',
};

// ----------------------------------------------------------------------------
// 1. Основные данные сделки
// ----------------------------------------------------------------------------
export const deal = {
  contractNumber: 'USDT-RUR/VDT-KMK-1/21042026',
  contractDate: '21.04.2026',
  status: DEAL_STATUS.ACTIVE_TRANCHE, // ← меняйте здесь статус сделки в шапке
  currency: 'USDT / RUB',
};

// ----------------------------------------------------------------------------
// 2. Стороны сделки
// ----------------------------------------------------------------------------
export const parties = {
  funder: {
    name: 'ООО «Газпром межрегионгаз»',
    short: 'Gazprom MRG',
    role: 'Источник фондирования',
  },
  bank: {
    name: 'Bank X',
    short: 'Bank X',
    role: 'Расчётный банк',
  },
  broker: {
    name: 'Брокерский счёт',
    short: 'Broker',
    role: 'Internal Settlement',
  },
  client: {
    name: 'Заказчик',
    short: 'Client',
    role: 'Получатель средств',
  },
};

// ----------------------------------------------------------------------------
// 3. Узлы финансового потока (4 шага)
//    iconName — имя иконки из lucide-react (см. FlowNode.jsx)
// ----------------------------------------------------------------------------
export const flowNodes = [
  {
    id: 'funding',
    iconName: 'Banknote',
    title: 'Funding',
    subtitle: 'Gazprom MRG → Bank X',
    description: 'Поступление рублёвого фондирования от источника',
  },
  {
    id: 'settlement',
    iconName: 'ArrowRightLeft',
    title: 'Internal Settlement',
    subtitle: 'Брокерский счёт',
    description: 'Внутренний расчёт по курсу',
    tooltip: 'Курс MOEX + 3 RUB', // ← Tooltip при наведении
  },
  {
    id: 'collateral',
    iconName: 'ShieldCheck',
    title: 'Digital Collateral',
    subtitle: 'USDT + TX-Hash',
    description: 'Цифровой залог зафиксирован on-chain',
  },
  {
    id: 'final',
    iconName: 'CheckCircle2',
    title: 'Final Settlement',
    subtitle: 'Рубли на счёт заказчика',
    description: 'Финальное зачисление средств',
    status: 'Завершено',
  },
];

// ----------------------------------------------------------------------------
// 4. Транши (Приложение №1)
//    Это главный массив для редактирования.
// ----------------------------------------------------------------------------
export const tranches = [
  {
    id: 1,
    number: '№ 1',
    amountUSDT: 100_000,
    status: TRANCHE_STATUS.COMPLETED,
    date: '2026-04-21',
    txHash: '0x9f2e...4b1a',
  },
  {
    id: 2,
    number: '№ 2',
    amountUSDT: 250_000,
    status: TRANCHE_STATUS.COMPLETED,
    date: '2026-04-29',
    txHash: '0x7c8d...e02f',
  },
  {
    id: 3,
    number: '№ 3',
    amountUSDT: 500_000,
    status: TRANCHE_STATUS.ACTIVE,
    date: '2026-05-10',
    txHash: '0x3a1b...9d7c',
  },
  {
    id: 4,
    number: '№ 4',
    amountUSDT: 300_000,
    status: TRANCHE_STATUS.PROCESSING,
    date: '2026-05-25',
    txHash: null,
  },
  {
    id: 5,
    number: '№ 5',
    amountUSDT: 350_000,
    status: TRANCHE_STATUS.PENDING,
    date: '2026-06-05',
    txHash: null,
  },
];

// ----------------------------------------------------------------------------
// 5. Документы для скачивания (Приложения)
//    file — путь относительно public/. Положите PDF в public/docs/.
// ----------------------------------------------------------------------------
export const documents = [
  {
    id: 6,
    title: 'Акт передачи залога',
    subtitle: 'Приложение №6',
    file: '/docs/prilozhenie-6-akt-zaloga.pdf',
    fileSize: '420 КБ',
  },
  {
    id: 7,
    title: 'Акт взыскания',
    subtitle: 'Приложение №7',
    file: '/docs/prilozhenie-7-akt-vzyskaniya.pdf',
    fileSize: '380 КБ',
  },
];
