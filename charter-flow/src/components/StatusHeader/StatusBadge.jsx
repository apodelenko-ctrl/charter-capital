import { motion } from 'framer-motion';
import { DEAL_STATUS } from '../../config/data';

/**
 * Карта визуального представления статусов сделки.
 * Каждый статус — своя надпись, цвет точки и поведение анимации.
 */
const STATUS_META = {
  [DEAL_STATUS.ACTIVE_TRANCHE]: {
    label: 'Активный транш',
    dot: 'bg-gold',
    ring: 'ring-gold/30',
    pulse: true,
  },
  [DEAL_STATUS.PROCESSING]: {
    label: 'В обработке',
    dot: 'bg-status-processing',
    ring: 'ring-status-processing/30',
    pulse: true,
  },
  [DEAL_STATUS.COMPLETED]: {
    label: 'Завершено',
    dot: 'bg-status-completed',
    ring: 'ring-status-completed/30',
    pulse: false,
  },
};

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META[DEAL_STATUS.PROCESSING];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-abyss-700/80 px-3.5 py-1.5 ring-1 ${meta.ring}`}
    >
      <span className="relative inline-flex h-2 w-2">
        {meta.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.dot} opacity-60`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/90">
        {meta.label}
      </span>
    </motion.div>
  );
}
