import { AnimatePresence, motion } from 'framer-motion';

/**
 * Институциональный tooltip — белая карточка с золотой обводкой.
 * Появляется при наведении на узел с дополнительной формулой/комментарием.
 */
export default function NodeTooltip({ visible, text }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="tooltip"
          className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-gold-600/40 bg-white px-3 py-1.5 shadow-card"
        >
          <span className="text-[11px] font-semibold tracking-wide text-gold-700">
            {text}
          </span>
          <span
            className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-gold-600/40 bg-white"
            aria-hidden
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
