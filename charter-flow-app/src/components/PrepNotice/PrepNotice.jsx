import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, X, Eye } from 'lucide-react';

/**
 * Верхний баннер с инструкцией для оператора по подготовке материала
 * для заказчика. Показывается ТОЛЬКО при URL c query-параметром ?prep=1.
 *
 * Логика:
 *   - открытие .../client.html             → баннер скрыт (видит заказчик)
 *   - открытие .../client.html?prep=1      → баннер видим (готовит оператор)
 *
 * Дополнительно: на баннере есть кнопка «Скрыть и посмотреть как заказчик»,
 * которая убирает баннер локально на текущей сессии.
 */
export default function PrepNotice({ instructions }) {
  const [visible, setVisible] = useState(false);
  const [hiddenLocally, setHiddenLocally] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setVisible(params.has('prep'));
  }, []);

  if (!visible || hiddenLocally) return null;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        role="note"
        className="relative rounded-lg border border-status-processing/30 bg-status-processing/[0.06] p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-status-processing/40 bg-white text-status-processing">
              <ClipboardList size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-institutional text-status-processing">
                Внутреннее · подготовка к отправке
              </div>
              <h3 className="mt-1 font-sans text-[15px] font-semibold text-ink sm:text-base">
                {instructions.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setHiddenLocally(true)}
            className="flex-shrink-0 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-status-processing/10 hover:text-status-processing"
            aria-label="Скрыть баннер"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <ol className="mt-4 space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-700 sm:pl-6">
          {instructions.steps.map((step, i) => (
            <li
              key={i}
              className="list-decimal marker:font-semibold marker:text-status-processing"
            >
              {step}
            </li>
          ))}
        </ol>

        <p className="mt-4 flex items-center gap-1.5 border-t border-status-processing/20 pt-3 text-[11px] italic text-ink-500">
          <Eye size={11} strokeWidth={2} className="text-status-processing" />
          {instructions.hint}
        </p>
      </motion.aside>
    </AnimatePresence>
  );
}
