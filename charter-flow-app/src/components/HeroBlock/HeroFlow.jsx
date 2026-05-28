import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Декоративный фон Hero-блока — тонкие пунктирные горизонтальные «треки»
 * со слабо светящимися золотыми частицами, плавно скользящими слева направо.
 *
 * Эстетика — финансовый терминал / тикерная лента:
 *  - 4 трека на разных высотах
 *  - на каждом треке две частицы, идущие со сдвигом фаз
 *  - все элементы — низкая прозрачность, не отвлекают от типографики
 *
 * Уважает prefers-reduced-motion: при включённой настройке частицы скрыты,
 * остаются только статичные пунктирные линии.
 */
export default function HeroFlow() {
  const reduced = useReducedMotion();

  // Конфигурация треков: высота на странице + параметры частиц
  const tracks = [
    {
      y: '14%',
      particles: [
        { delay: 0.0, duration: 6.5 },
        { delay: 3.4, duration: 6.5 },
      ],
    },
    {
      y: '38%',
      particles: [
        { delay: 1.2, duration: 7.5 },
        { delay: 4.9, duration: 7.5 },
      ],
    },
    {
      y: '62%',
      particles: [
        { delay: 0.6, duration: 6.0 },
        { delay: 3.8, duration: 6.0 },
      ],
    },
    {
      y: '86%',
      particles: [
        { delay: 2.0, duration: 7.0 },
        { delay: 5.6, duration: 7.0 },
      ],
    },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Пунктирные треки */}
      {tracks.map((track, i) => (
        <div
          key={`line-${i}`}
          className="absolute left-0 right-0 h-px border-t border-dashed border-gold-600/20"
          style={{ top: track.y }}
        />
      ))}

      {/* Частицы, движущиеся по трекам */}
      {!reduced &&
        tracks.flatMap((track, i) =>
          track.particles.map((p, j) => (
            <motion.span
              key={`dot-${i}-${j}`}
              className="absolute h-1.5 w-1.5 rounded-full bg-gold-500"
              style={{
                top: track.y,
                marginTop: '-3px',
                boxShadow: '0 0 8px rgba(156, 124, 42, 0.5)',
              }}
              animate={{
                left: ['-3%', '103%'],
                opacity: [0, 0.9, 0.9, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'linear',
                times: [0, 0.08, 0.92, 1],
              }}
            />
          )),
        )}

      {/* Мягкий «свет» в правой части — намёк на финальную точку маршрута */}
      <div
        className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-gold-500/[0.04] to-transparent"
        aria-hidden
      />
    </div>
  );
}
