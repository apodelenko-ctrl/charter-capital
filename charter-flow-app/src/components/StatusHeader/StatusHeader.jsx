import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';

/**
 * Шапка дашборда: логотип Charter Flow + метаданные сделки + статус-индикатор.
 * Адаптивно: на мобильных переходит в столбец.
 */
export default function StatusHeader({ deal }) {
  return (
    <header className="terminal-card flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between md:gap-8 md:p-7">
      <div className="flex items-center gap-4">
        <Logo />
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Институциональный мониторинг сделки
          </span>
          <h1 className="font-sans text-xl font-bold tracking-tight text-white sm:text-[22px]">
            Charter <span className="text-gold-gradient">Flow</span>
          </h1>
        </div>
      </div>

      <div className="hidden h-12 w-px bg-white/5 md:block" />

      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex-1 md:justify-end md:gap-6"
      >
        <div className="flex items-start gap-2.5">
          <FileText
            size={16}
            strokeWidth={1.75}
            className="mt-0.5 text-white/40"
          />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Договор займа
            </div>
            <div className="mt-0.5 font-mono text-[13px] text-white/90">
              {deal.contractNumber}
            </div>
          </div>
        </div>

        <StatusBadge status={deal.status} />
      </motion.div>
    </header>
  );
}

/**
 * SVG-логотип Charter Flow — гексагональная марка с золотым градиентом.
 */
function Logo() {
  return (
    <motion.div
      initial={{ opacity: 0, rotate: -8 }}
      animate={{ opacity: 1, rotate: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="grid h-11 w-11 place-items-center rounded-xl border border-gold/30 bg-gold/5 shadow-gold"
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E5C76B" />
            <stop offset="100%" stopColor="#8C6F22" />
          </linearGradient>
        </defs>
        <path
          d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z"
          fill="none"
          stroke="url(#logo-grad)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M11 13 L21 13 M11 19 L18 19"
          stroke="url(#logo-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}
