import { Layers } from 'lucide-react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import { TrancheRowDesktop, TrancheRowMobile } from './TrancheRow';

/**
 * Таблица траншей (Приложение №1).
 *
 *  - sm+:    традиционная таблица с заголовком
 *  - mobile: набор карточек (TrancheRowMobile)
 *
 * Все данные приходят из data.js → tranches.
 */
export default function TrancheTable({ tranches }) {
  // Подсчёт суммарного значения по всем траншам
  const total = tranches.reduce((acc, t) => acc + t.amountUSDT, 0);
  const formattedTotal = new Intl.NumberFormat('ru-RU').format(total);

  return (
    <Card delay={0.2}>
      <SectionTitle
        title="Транши"
        subtitle={`Приложение №1 · всего ${formattedTotal} USDT`}
        icon={Layers}
      />

      {/* Desktop: <table> */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                Транш №
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                Сумма (USDT)
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                Статус
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                Дата
              </th>
            </tr>
          </thead>
          <tbody>
            {tranches.map((tranche, idx) => (
              <TrancheRowDesktop
                key={tranche.id}
                tranche={tranche}
                index={idx}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: список карточек */}
      <div className="flex flex-col gap-3 sm:hidden">
        {tranches.map((tranche, idx) => (
          <TrancheRowMobile key={tranche.id} tranche={tranche} index={idx} />
        ))}
      </div>
    </Card>
  );
}
