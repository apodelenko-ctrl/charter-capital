import { motion } from 'framer-motion';
import HeroFlow from './HeroFlow';

/**
 * Hero-блок презентации.
 * Стиль JP Morgan: серьёзная типографика, тонкая золотая черта,
 * декоративная фоновая графика «потока средств» под заголовком.
 */
export default function HeroBlock({ hero }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative isolate"
    >
      {/* Декоративный фон — пунктирные треки с золотыми частицами */}
      <HeroFlow />

      {/* Контент Hero сидит поверх фона */}
      <div className="relative z-10 py-6 sm:py-8">
        <div className="section-eyebrow mb-4">{hero.eyebrow}</div>

        <h1 className="font-sans text-[44px] font-bold leading-[0.98] tracking-[-0.02em] text-ink sm:text-[60px] md:text-[80px] lg:text-[96px]">
          {hero.title}
        </h1>

        <p className="mt-5 max-w-3xl text-[18px] leading-snug text-ink-700 sm:text-[21px] md:text-[22px]">
          {hero.subtitle}
        </p>

        <div className="gold-rule mt-6" />

        <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-ink-600 sm:text-[16px]">
          {hero.summary}
        </p>
      </div>
    </motion.section>
  );
}
