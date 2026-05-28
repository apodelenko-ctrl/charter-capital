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
      className="py-8 sm:py-12 md:py-16"
    >
      <div className="section-eyebrow mb-5">{hero.eyebrow}</div>

      <h1 className="font-sans text-[40px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[56px] md:text-[68px]">
        {hero.title}
      </h1>

      <p className="mt-5 max-w-3xl text-[18px] leading-relaxed text-ink-700 sm:text-[20px]">
        {hero.subtitle}
      </p>

      <div className="gold-rule mt-10" />

      <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-ink-600 sm:text-[16px]">
        {hero.summary}
      </p>
    </motion.section>
  );
}
