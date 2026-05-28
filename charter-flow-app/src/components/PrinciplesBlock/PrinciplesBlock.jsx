import { motion } from 'framer-motion';
import { Eye, Scale, Lock, FileCheck2, Zap } from 'lucide-react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';

// Маппинг иконок lucide-react по iconName из data.js
const ICONS = { Eye, Scale, Lock, FileCheck2, Zap };

/**
 * Блок «Принципы» — четыре принципа, которые обеспечивает структура сделки.
 * Сетка 2×2 на десктопе, 1 колонка на мобильных.
 */
export default function PrinciplesBlock({ principles }) {
  return (
    <Card delay={0.1}>
      <SectionTitle
        eyebrow="Раздел 02 · Гарантии"
        title="Что обеспечивает структура"
        lead="Маршрут построен так, чтобы исключить односторонние действия и обеспечить независимую верификацию каждого шага."
      />

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        {principles.map((p, idx) => {
          const Icon = ICONS[p.iconName] ?? Lock;
          return (
            <motion.article
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
              className="flex gap-4 rounded-lg border border-rule bg-paper-50 p-5 sm:p-6"
            >
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border border-gold-600/30 bg-white text-gold-600">
                <Icon size={18} strokeWidth={1.6} aria-hidden />
              </span>
              <div>
                <h3 className="font-sans text-[16px] font-semibold text-ink">
                  {p.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
                  {p.description}
                </p>
              </div>
            </motion.article>
          );
        })}
      </div>
    </Card>
  );
}
