import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Анимированный «поток» между узлами цепочки.
 *
 *  - На широких экранах: горизонтальная линия с тремя бегущими частицами слева направо.
 *  - На мобильных:        вертикальная линия с частицами сверху вниз.
 *
 * Уважает prefers-reduced-motion: при включённой настройке частицы статичны.
 *
 * Реализация — SVG с <animateMotion> для надёжности (не зависит от перерасчётов layout).
 * Но мы используем CSS-transitions через framer-motion вариант с translateX/Y по линии,
 * это даёт точный контроль и плавность.
 */
export default function FlowStream({ orientation = 'horizontal' }) {
  const reduced = useReducedMotion();
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={
        isHorizontal
          ? 'relative flex h-px flex-1 items-center'
          : 'relative my-2 h-12 w-px self-center'
      }
      aria-hidden
    >
      {/* Базовая линия (статичная) */}
      <div
        className={
          isHorizontal
            ? 'h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent'
            : 'h-full w-px bg-gradient-to-b from-transparent via-gold/40 to-transparent'
        }
      />

      {/* Бегущая золотая «волна» — лёгкое свечение поверх линии */}
      {!reduced && (
        <motion.div
          className={
            isHorizontal
              ? 'absolute inset-y-[-2px] left-0 w-1/3 bg-gradient-to-r from-transparent via-gold/70 to-transparent blur-[1px]'
              : 'absolute inset-x-[-2px] top-0 h-1/3 bg-gradient-to-b from-transparent via-gold/70 to-transparent blur-[1px]'
          }
          animate={
            isHorizontal
              ? { x: ['-30%', '120%'] }
              : { y: ['-30%', '120%'] }
          }
          transition={{
            duration: 2.6,
            ease: 'linear',
            repeat: Infinity,
          }}
        />
      )}

      {/* Дискретные частицы */}
      {!reduced &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.9)]"
            style={
              isHorizontal
                ? { top: '50%', translateY: '-50%' }
                : { left: '50%', translateX: '-50%' }
            }
            animate={
              isHorizontal
                ? { left: ['-2%', '102%'], opacity: [0, 1, 1, 0] }
                : { top: ['-2%', '102%'], opacity: [0, 1, 1, 0] }
            }
            transition={{
              duration: 2.4,
              ease: 'linear',
              repeat: Infinity,
              delay: i * 0.8,
              times: [0, 0.1, 0.9, 1],
            }}
          />
        ))}
    </div>
  );
}
