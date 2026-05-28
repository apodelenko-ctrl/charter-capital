import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
  Info,
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
 * Один узел финансового потока.
 *   - иконка в круглой золотой обводке
 *   - заголовок, подзаголовок
 *   - опциональный Tooltip при наведении (если есть node.tooltip)
 *   - анимация появления (delay по индексу)
 */
export default function FlowNode({ node, index, isLast }) {
  const [hovered, setHovered] = useState(false);
  const Icon = ICONS[node.iconName] ?? Banknote;
  const hasTooltip = Boolean(node.tooltip);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.15 }}
      className="relative flex flex-1 min-w-[140px] flex-col items-center text-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={hasTooltip ? 0 : -1}
      aria-describedby={hasTooltip ? `tooltip-${node.id}` : undefined}
    >
      {hasTooltip && <NodeTooltip visible={hovered} text={node.tooltip} />}

      {/* Иконка в круге */}
      <motion.div
        whileHover={{ scale: 1.06 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="relative grid h-16 w-16 place-items-center rounded-full border border-gold/40 bg-abyss-700 shadow-gold sm:h-[72px] sm:w-[72px]"
      >
        {/* Внутреннее золотое свечение */}
        <div className="absolute inset-1.5 rounded-full bg-gold/5" />
        <Icon
          size={26}
          strokeWidth={1.6}
          className="relative text-gold"
          aria-hidden
        />
        {hasTooltip && (
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-gold/40 bg-abyss-700">
            <Info size={11} strokeWidth={2} className="text-gold" />
          </span>
        )}
      </motion.div>

      {/* Текст */}
      <div className="mt-3.5 flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-[0.18em] text-gold/80">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3 className="mt-1 font-sans text-[15px] font-semibold leading-tight text-white sm:text-base">
          {node.title}
        </h3>
        <p className="mt-1 max-w-[160px] text-[12px] leading-snug text-white/55">
          {node.subtitle}
        </p>
        {node.status && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-status-completed/30 bg-status-completed/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-status-completed">
            <span className="h-1.5 w-1.5 rounded-full bg-status-completed" />
            {node.status}
          </span>
        )}
      </div>
    </motion.div>
  );
}
