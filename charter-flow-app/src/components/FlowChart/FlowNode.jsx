import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
  Info,
  Clock,
} from 'lucide-react';
import NodeTooltip from './NodeTooltip';

// Карта иконок lucide-react, маппится по iconName из data.js
const ICONS = {
  Banknote,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
};

/**
 * Один узел финансового потока — карточка с расширенной подписью:
 *   - номер шага (01–04)
 *   - иконка в золотой рамке
 *   - заголовок + подзаголовок (стороны)
 *   - подробное описание (3-4 строки)
 *   - bullets: список ключевых пунктов
 *   - бейдж тайминга (T+0, T+1...)
 *   - tooltip с формулой (только узел №2)
 */
export default function FlowNode({ node, index }) {
  const [hovered, setHovered] = useState(false);
  const Icon = ICONS[node.iconName] ?? Banknote;
  const hasTooltip = Boolean(node.tooltip);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.1 }}
      className="relative flex flex-1 flex-col rounded-lg border border-rule bg-paper-50 p-5 md:min-w-0 md:basis-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hasTooltip && <NodeTooltip visible={hovered} text={node.tooltip} />}

      {/* Верхняя строка: номер шага + тайминг */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold tracking-wider text-gold-600">
          ШАГ {node.step}
        </span>
        {node.timeline && (
          <span className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-mono text-ink-600">
            <Clock size={10} strokeWidth={2} />
            {node.timeline}
          </span>
        )}
      </div>

      {/* Иконка */}
      <motion.div
        whileHover={{ scale: 1.04 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="relative mt-4 grid h-14 w-14 place-items-center rounded-lg border border-gold-600/30 bg-white shadow-soft"
      >
        <Icon size={24} strokeWidth={1.6} className="text-gold-600" aria-hidden />
        {hasTooltip && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-gold-600/40 bg-white shadow-soft">
            <Info size={11} strokeWidth={2.2} className="text-gold-600" />
          </span>
        )}
      </motion.div>

      {/* Заголовок + headline */}
      <h3 className="mt-5 font-sans text-[18px] font-semibold leading-tight text-ink">
        {node.title}
      </h3>
      <p className="mt-1 font-mono text-[12px] uppercase tracking-wider text-ink-500">
        {node.headline}
      </p>

      {/* Подробное описание — суть шага */}
      <p className="mt-4 text-[14px] leading-relaxed text-ink-700">
        {node.description}
      </p>

      {/* Bullets — конкретика и документы */}
      {node.bullets && node.bullets.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-rule pt-4">
          {node.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[13px] leading-snug text-ink-600"
            >
              <span
                className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gold-600"
                aria-hidden
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}
