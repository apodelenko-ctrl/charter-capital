import { AnimatePresence, motion } from 'framer-motion';

/**
 * Tooltip с формулой/комментарием, появляется при наведении на узел.
 * Позиционируется над узлом, имеет золотую обводку.
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
          className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-gold/40 bg-abyss-700/95 px-3 py-1.5 shadow-gold backdrop-blur"
        >
          <span className="text-[11px] font-medium tracking-wide text-gold">
            {text}
          </span>
          <span
            className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-gold/40 bg-abyss-700"
            aria-hidden
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
