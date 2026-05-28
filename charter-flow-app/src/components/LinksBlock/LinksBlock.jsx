import { motion } from 'framer-motion';
import { Building2, BookOpen, KeyRound, ArrowUpRight } from 'lucide-react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';

const ICONS = { Building2, BookOpen, KeyRound };

/**
 * Блок «Дополнительные материалы» — ссылки на основной сайт,
 * журнал и закрытую процедуру легализации капитала.
 */
export default function LinksBlock({ links }) {
  return (
    <Card delay={0.2}>
      <SectionTitle
        eyebrow="Раздел 04 · Дополнительные материалы"
        title="Связанные ресурсы"
        lead="Документ — часть более широкого корпоративного контекста. Полезные ссылки для углублённого знакомства с компанией и практикой."
      />

      <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
        {links.map((link, idx) => {
          const Icon = ICONS[link.iconName] ?? Building2;
          return (
            <motion.a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
              whileHover={{ y: -3 }}
              className="group relative flex flex-col rounded-lg border border-rule bg-paper-50 p-5 transition-all hover:border-gold-600/50 hover:bg-white hover:shadow-card sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-gold-600/30 bg-white text-gold-600">
                  <Icon size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <ArrowUpRight
                  size={16}
                  strokeWidth={2}
                  className="text-ink-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold-600"
                  aria-hidden
                />
              </div>

              <div className="mt-5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-institutional text-gold-700">
                  {link.subtitle}
                </span>
                <h3 className="mt-1 font-sans text-[16px] font-semibold leading-tight text-ink">
                  {link.title}
                </h3>
                <p className="mt-2 text-[13px] leading-snug text-ink-600">
                  {link.description}
                </p>
              </div>
            </motion.a>
          );
        })}
      </div>
    </Card>
  );
}
