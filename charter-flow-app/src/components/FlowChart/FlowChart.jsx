import { Fragment } from 'react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import FlowNode from './FlowNode';
import FlowStream from './FlowStream';

/**
 * Блок «Финансовый поток» — четыре стадии движения капитала
 * с расширенными подписями.
 *
 * Адаптивность:
 *   - lg+:    четыре узла в строку со стрелками
 *   - mobile: вертикальный список со стрелками вниз
 */
export default function FlowChart({ nodes }) {
  return (
    <Card delay={0.05}>
      <SectionTitle
        eyebrow="Раздел 01 · Архитектура расчётов"
        title="Финансовый поток"
        lead="Маршрут средств — от источника фондирования до финального зачисления заказчику — состоит из четырёх стадий. Конвертация и перевод выполняются внутри инфраструктуры агента (банковский счёт → брокерский счёт), при этом заказчик получает средства по курсу, зафиксированному договором займа."
      />

      {/* Горизонтальный вариант (lg и шире) */}
      <div className="hidden items-stretch lg:flex">
        {nodes.map((node, idx) => (
          <Fragment key={node.id}>
            <FlowNode node={node} index={idx} />
            {idx < nodes.length - 1 && <FlowStream orientation="horizontal" />}
          </Fragment>
        ))}
      </div>

      {/* Вертикальный вариант (mobile / tablet) */}
      <div className="flex flex-col items-stretch lg:hidden">
        {nodes.map((node, idx) => (
          <Fragment key={node.id}>
            <FlowNode node={node} index={idx} />
            {idx < nodes.length - 1 && <FlowStream orientation="vertical" />}
          </Fragment>
        ))}
      </div>
    </Card>
  );
}
