import { motion } from 'framer-motion';

/**
 * Универсальная премиум-карточка с тёмным фоном и тонкой обводкой.
 * Используется для оборачивания крупных секций дашборда.
 */
export default function Card({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`terminal-card p-5 sm:p-6 md:p-8 ${className}`}
    >
      {children}
    </motion.div>
  );
}
