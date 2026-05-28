import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Стрелка-разделитель между узлами потока (институциональный, сдержанный стиль).
 *
 *   - На широких экранах: горизонтальная пунктирная линия + золотой шеврон вправо.
 *   - На мобильных:        вертикальная пунктирная линия + золотой шеврон вниз.
 *
 * Анимация лёгкая, без бегущих частиц — это серьёзный документ, а не дашборд.
 * Уважает prefers-reduced-motion.
 */
export default function FlowStream({ orientation = 'horizontal' }) {
  const reduced = useReducedMotion();
  const isHorizontal = orientation === 'horizontal';
  const Chevron = isHorizontal ? ChevronRight : ChevronDown;

  return (
    <div
      className={
        isHorizontal
          ? 'relative mt-12 flex flex-shrink-0 items-center self-start px-1'
          : 'relative my-3 flex flex-shrink-0 flex-col items-center self-center'
      }
      aria-hidden
    >
      {/* Пунктирная линия */}
      <div
        className={
          isHorizontal
            ? 'h-px w-10 border-t border-dashed border-gold-600/40'
            : 'h-8 w-px border-l border-dashed border-gold-600/40'
        }
      />

      {/* Шеврон с лёгкой пульсацией */}
      <motion.span
        className={
          isHorizontal
            ? 'absolute -right-1.5 top-1/2 -translate-y-1/2'
            : 'absolute -bottom-1.5 left-1/2 -translate-x-1/2'
        }
        animate={
          reduced
            ? {}
            : isHorizontal
              ? { x: [0, 3, 0] }
              : { y: [0, 3, 0] }
        }
        transition={{
          duration: 2.4,
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        <Chevron size={16} strokeWidth={2} className="text-gold-600" />
      </motion.span>
    </div>
  );
}
