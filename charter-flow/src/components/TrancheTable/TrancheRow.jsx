import { motion } from 'framer-motion';
import { TRANCHE_STATUS } from '../../config/data';

/**
 * Цветовая палитра статусов транша.
 * Возвращает Tailwind-классы для бейджа.
 */
function statusClasses(status) {
  switch (status) {
    case TRANCHE_STATUS.COMPLETED:
      return {
        dot: 'bg-status-completed',
        text: 'text-status-completed',
        bg: 'bg-status-completed/10 border-status-completed/30',
      };
    case TRANCHE_STATUS.ACTIVE:
      return {
        dot: 'bg-gold',
        text: 'text-gold',
        bg: 'bg-gold/10 border-gold/30',
      };
    case TRANCHE_STATUS.PROCESSING:
      return {
        dot: 'bg-status-processing',
        text: 'text-status-processing',
        bg: 'bg-status-processing/10 border-status-processing/30',
      };
    default:
      return {
        dot: 'bg-white/40',
        text: 'text-white/70',
        bg: 'bg-white/5 border-white/10',
      };
  }
}

/**
 * Форматирование суммы в USDT — пробел-разделители тысяч.
 */
function formatAmount(amount) {
  return new Intl.NumberFormat('ru-RU').format(amount);
}

/**
 * Форматирование даты ISO → DD.MM.YYYY.
 */
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Строка таблицы траншей.
 *
 * Имеет ДВА варианта рендера:
 *   - desktop: классическая <tr> для <table>
 *   - mobile:  карточный вид (вызывается из TrancheTable)
 */
export function TrancheRowDesktop({ tranche, index }) {
  const s = statusClasses(tranche.status);

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
    >
      <td className="px-4 py-4 align-middle">
        <span className="font-mono text-sm font-medium text-white">
          {tranche.number}
        </span>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-white">
            {formatAmount(tranche.amountUSDT)}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            USDT
          </span>
        </div>
        {tranche.txHash && (
          <span className="mt-0.5 block font-mono text-[11px] text-white/40">
            {tranche.txHash}
          </span>
        )}
      </td>
      <td className="px-4 py-4 align-middle">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider ${s.bg} ${s.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {tranche.status}
        </span>
      </td>
      <td className="px-4 py-4 text-right align-middle">
        <span className="font-mono text-sm tabular-nums text-white/80">
          {formatDate(tranche.date)}
        </span>
      </td>
    </motion.tr>
  );
}

/**
 * Карточный вид строки для мобильных.
 */
export function TrancheRowMobile({ tranche, index }) {
  const s = statusClasses(tranche.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="rounded-xl border border-white/5 bg-abyss-700/50 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Транш
          </div>
          <div className="mt-0.5 font-mono text-base font-semibold text-white">
            {tranche.number}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${s.bg} ${s.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {tranche.status}
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-white/5 pt-3">
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          Сумма
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-base font-semibold tabular-nums text-white">
            {formatAmount(tranche.amountUSDT)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            USDT
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          Дата
        </span>
        <span className="font-mono text-sm tabular-nums text-white/80">
          {formatDate(tranche.date)}
        </span>
      </div>

      {tranche.txHash && (
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            TX-Hash
          </span>
          <span className="font-mono text-xs text-white/60">{tranche.txHash}</span>
        </div>
      )}
    </motion.div>
  );
}
