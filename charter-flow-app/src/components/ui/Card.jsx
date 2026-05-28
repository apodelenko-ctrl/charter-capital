import { motion } from 'framer-motion';

/**
 * Институциональная карточка-«бумага» — белый фон, тонкая обводка, мягкая тень.
 * Используется для оборачивания крупных секций презентации.
 */
export default function Card({ children, className = '', delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`doc-card p-6 sm:p-8 md:p-10 ${className}`}
    >
      {children}
    </motion.section>
  );
}
