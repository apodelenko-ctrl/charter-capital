import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';

/**
 * Дисклеймер / NDA-блок.
 *
 * Содержит:
 *  - указание на конфиденциальность
 *  - отказ от квалификации как оферты или рекомендации
 *  - режим использования и ответственность получателя
 *  - подпись эмитента
 */
export default function DisclaimerBlock({ disclaimer }) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="relative rounded-lg border border-rule-strong bg-paper-100 p-6 sm:p-8 md:p-10"
    >
      <div className="flex items-center gap-2.5">
        <ShieldAlert size={16} strokeWidth={2} className="text-gold-700" />
        <span className="section-eyebrow">{disclaimer.eyebrow}</span>
      </div>

      <h3 className="mt-4 font-sans text-[18px] font-semibold tracking-tight text-ink sm:text-[20px]">
        {disclaimer.title}
      </h3>

      <div className="mt-5 space-y-4 text-[13px] leading-relaxed text-ink-600 sm:text-[13.5px]">
        {disclaimer.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-6 border-t border-rule pt-4 font-mono text-[11px] uppercase tracking-institutional text-ink-500">
        {disclaimer.signature}
      </div>
    </motion.aside>
  );
}
