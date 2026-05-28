import StatusHeader from './components/StatusHeader/StatusHeader';
import HeroBlock from './components/HeroBlock/HeroBlock';
import FlowChart from './components/FlowChart/FlowChart';
import PrinciplesBlock from './components/PrinciplesBlock/PrinciplesBlock';
import DocumentSection from './components/DocumentSection/DocumentSection';
import LinksBlock from './components/LinksBlock/LinksBlock';
import DisclaimerBlock from './components/DisclaimerBlock/DisclaimerBlock';
import {
  deal,
  recipient,
  issuer,
  hero,
  flowNodes,
  principles,
  documents,
  externalLinks,
  disclaimer,
} from './config/data';

/**
 * Корневой компонент презентации Charter Flow.
 *
 * Структура (как у деловой презентации JP Morgan):
 *   1. StatusHeader  — фирменный бланк: эмитент, адресат, реквизиты договора
 *   2. HeroBlock     — заголовок и executive summary
 *   3. FlowChart     — Раздел 01: четыре стадии движения капитала
 *   4. Principles    — Раздел 02: что обеспечивает структура
 *   5. Documents     — Раздел 03: первичные документы (PDF)
 *   6. Links         — Раздел 04: дополнительные материалы
 *   7. Disclaimer    — NDA / условия использования материала
 *
 * Все тексты — в config/data.js.
 */
export default function App() {
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 md:gap-7 md:py-8">
        <StatusHeader deal={deal} issuer={issuer} recipient={recipient} />

        <HeroBlock hero={hero} />

        <FlowChart nodes={flowNodes} />

        <PrinciplesBlock principles={principles} />

        <DocumentSection documents={documents} />

        <LinksBlock links={externalLinks} />

        <DisclaimerBlock disclaimer={disclaimer} />

        <PageFooter issuer={issuer} />
      </div>
    </div>
  );
}

/**
 * Тонкий подвал страницы — пейджинг номер документа и копирайт.
 */
function PageFooter({ issuer }) {
  return (
    <footer className="flex flex-col items-center justify-between gap-2 border-t border-rule pt-6 text-[11px] text-ink-400 sm:flex-row">
      <span className="font-mono uppercase tracking-institutional">
        Charter Flow · v1.0
      </span>
      <span className="font-mono uppercase tracking-institutional">
        © {new Date().getFullYear()} {issuer.name}
      </span>
    </footer>
  );
}
