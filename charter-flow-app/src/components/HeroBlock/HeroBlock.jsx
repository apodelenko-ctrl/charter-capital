import { motion } from 'framer-motion';

/**
 * Hero-блок презентации — крупный заголовок и executive summary.
 * Стиль JP Morgan: серьёзная типографика, тонкая золотая черта,
 * щедрые отступы.
 */
export default function HeroBlock({ hero }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="section-eyebrow mb-4">{hero.eyebrow}</div>

      <h1 className="font-sans text-[52px] font-bold leading-[0.98] tracking-[-0.02em] text-ink sm:text-[80px] md:text-[104px] lg:text-[120px]">
        {hero.title}
      </h1>

      <p className="mt-5 max-w-3xl text-[19px] leading-snug text-ink-700 sm:text-[22px] md:text-[24px]">
        {hero.subtitle}
      </p>

      <div className="gold-rule mt-6" />

      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-ink-600 sm:text-[16px]">
        {hero.summary}
      </p>
    </motion.section>
  );
}
