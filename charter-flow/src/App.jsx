import { motion } from 'framer-motion';
import StatusHeader from './components/StatusHeader/StatusHeader';
import FlowChart from './components/FlowChart/FlowChart';
import TrancheTable from './components/TrancheTable/TrancheTable';
import DocumentSection from './components/DocumentSection/DocumentSection';
import { deal, flowNodes, tranches, documents, parties } from './config/data';

/**
 * Корневой компонент дашборда Charter Flow.
 * Композиция четырёх секций:
 *   1. StatusHeader
 *   2. FlowChart
 *   3. TrancheTable
 *   4. DocumentSection
 *
 * Все данные тянутся из config/data.js.
 */
export default function App() {
  return (
    <div className="min-h-screen w-full">
      {/* Внешний контейнер с safe-padding */}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 md:py-10">
        {/* 1. Шапка со статусом */}
        <StatusHeader deal={deal} />

        {/* 2. Финансовый поток */}
        <FlowChart nodes={flowNodes} />

        {/* 3. Таблица траншей */}
        <TrancheTable tranches={tranches} />

        {/* 4. Документация */}
        <DocumentSection documents={documents} />

        {/* Футер: стороны сделки и подпись */}
        <Footer parties={parties} />
      </div>
    </div>
  );
}

/**
 * Подвал — информация о сторонах и копирайт.
 */
function Footer({ parties }) {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="mt-2 flex flex-col gap-4 border-t border-white/5 pt-6 text-[11px] text-white/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="uppercase tracking-[0.18em]">Стороны:</span>
        <span className="text-white/60">{parties.funder.short}</span>
        <span className="text-white/20">→</span>
        <span className="text-white/60">{parties.bank.short}</span>
        <span className="text-white/20">→</span>
        <span className="text-white/60">{parties.broker.short}</span>
        <span className="text-white/20">→</span>
        <span className="text-white/60">{parties.client.short}</span>
      </div>
      <div className="font-mono uppercase tracking-[0.18em]">
        © {new Date().getFullYear()} Charter Flow · Institutional Terminal
      </div>
    </motion.footer>
  );
}
