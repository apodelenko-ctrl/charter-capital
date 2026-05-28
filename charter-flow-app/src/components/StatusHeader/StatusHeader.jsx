import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

/**
 * Шапка-«фирменный бланк» презентации.
 *
 * Структура (как у документа JP Morgan):
 *   - слева: логотип Charter Flow + название эмитента
 *   - справа: мета — номер договора + индикатор "конфиденциально"
 *   - снизу: тонкая золотая черта во всю ширину
 */
export default function StatusHeader({ deal, issuer, recipient }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex flex-col gap-6 pb-6 sm:pb-8"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        {/* Логотип + эмитент */}
        <div className="flex items-center gap-4">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-institutional text-gold-600">
              {issuer.name}
            </span>
            <h1 className="mt-1 font-sans text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
              Charter <span className="text-gold-600">Flow</span>
            </h1>
            <span className="mt-0.5 text-[11px] text-ink-500">
              {issuer.domain}
            </span>
          </div>
        </div>

        {/* Адресат + статус конфиденциальности */}
        <div className="flex flex-col gap-3 sm:items-end">
          <ConfidentialBadge />
          <div className="text-left sm:text-right">
            <div className="text-[10px] font-semibold uppercase tracking-institutional text-ink-400">
              Адресовано
            </div>
            <div className="mt-1 font-sans text-[14px] font-semibold text-ink sm:text-[15px]">
              {recipient.name}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-500">
              {recipient.role}
            </div>
          </div>
        </div>
      </div>

      {/* Реквизиты договора */}
      <div className="flex flex-col gap-2 border-t border-rule pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-institutional text-ink-400">
            Договор займа
          </span>
          <span className="font-mono text-[12px] text-ink-700 sm:text-[13px]">
            № {deal.contractNumber}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-institutional text-ink-400">
            Дата
          </span>
          <span className="font-mono text-[12px] text-ink-700 sm:text-[13px]">
            {deal.contractDate}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-institutional text-ink-400">
            Валюты
          </span>
          <span className="font-mono text-[12px] text-ink-700 sm:text-[13px]">
            {deal.currency}
          </span>
        </div>
      </div>
    </motion.header>
  );
}

/**
 * Индикатор «Конфиденциально» — золотая обводка, иконка замка.
 */
function ConfidentialBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-600/40 bg-gold-600/[0.06] px-3 py-1">
      <Lock size={12} strokeWidth={2} className="text-gold-600" />
      <span className="text-[10px] font-semibold uppercase tracking-institutional text-gold-700">
        Конфиденциально
      </span>
    </span>
  );
}

/**
 * SVG-логотип — гексагональная марка с инициалами CF.
 * Светлая тема: золото на белом, тонкие линии.
 */
function Logo() {
  return (
    <div className="grid h-12 w-12 place-items-center rounded-lg border border-gold-600/30 bg-white shadow-soft">
      <svg viewBox="0 0 32 32" className="h-7 w-7">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C9A961" />
            <stop offset="100%" stopColor="#7E6420" />
          </linearGradient>
        </defs>
        <path
          d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z"
          fill="none"
          stroke="url(#logo-grad)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M11 13 L21 13 M11 19 L18 19"
          stroke="url(#logo-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
