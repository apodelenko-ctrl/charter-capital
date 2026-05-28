import StatusHeader from './components/StatusHeader/StatusHeader';
import HeroBlock from './components/HeroBlock/HeroBlock';
import FlowChart from './components/FlowChart/FlowChart';
import PrinciplesBlock from './components/PrinciplesBlock/PrinciplesBlock';
import DocumentSection from './components/DocumentSection/DocumentSection';
import DisclaimerBlock from './components/DisclaimerBlock/DisclaimerBlock';
import PrepNotice from './components/PrepNotice/PrepNotice';
import {
  deal,
  recipient,
  issuer,
  hero,
  flowNodes,
  principles,
  documents,
  disclaimer,
  prepInstructions,
} from './config/client-data';

/**
 * Клиентская версия презентации Charter Flow.
 *
 * Назначение: материал для конечного заказчика (Доверителя).
 * Содержание: исполнение договора поручения (Гл. 49 ГК РФ), без деталей
 * внутренней операционной механики, без упоминания залога/USDT.
 *
 * Структура:
 *   0. PrepNotice    — баннер с инструкцией для оператора (?prep=1)
 *   1. StatusHeader  — фирменный бланк
 *   2. HeroBlock     — заголовок и executive summary
 *   3. FlowChart     — четыре стадии исполнения поручения
 *   4. Principles    — принципы исполнения
 *   5. Documents     — закрывающие документы
 *   6. Disclaimer    — NDA / условия использования материала
 */
export default function ClientApp() {
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 md:gap-7 md:py-8">
        {/* Видим только при ?prep=1 — инструкция для оператора */}
        <PrepNotice instructions={prepInstructions} />

        <StatusHeader deal={deal} issuer={issuer} recipient={recipient} />

        <HeroBlock hero={hero} />

        <FlowChart nodes={flowNodes} />

        <PrinciplesBlock principles={principles} />

        <DocumentSection documents={documents} />

        <DisclaimerBlock disclaimer={disclaimer} />

        <ClientFooter issuer={issuer} />
      </div>
    </div>
  );
}

function ClientFooter({ issuer }) {
  return (
    <footer className="flex flex-col items-center justify-between gap-2 border-t border-rule pt-6 text-[11px] text-ink-400 sm:flex-row">
      <span className="font-mono uppercase tracking-institutional">
        Charter Flow · Client view · v1.0
      </span>
      <span className="font-mono uppercase tracking-institutional">
        © {new Date().getFullYear()} {issuer.name}
      </span>
    </footer>
  );
}
