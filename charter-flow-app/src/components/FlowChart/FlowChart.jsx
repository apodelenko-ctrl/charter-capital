import { Fragment } from 'react';
import { Activity } from 'lucide-react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import FlowNode from './FlowNode';
import FlowStream from './FlowStream';

/**
 * Блок «Финансовый поток» — цепочка из 4 узлов с анимированными потоками.
 *
 * Адаптивность:
 *   - md+:    горизонтальная цепочка
 *   - mobile: вертикальная цепочка (стрелки вниз)
 */
export default function FlowChart({ nodes }) {
  return (
    <Card delay={0.1}>
      <SectionTitle
        title="Финансовый поток"
        subtitle="Визуализация движения капитала"
        icon={Activity}
      />

      {/* Горизонтальный вариант (md и шире) */}
      <div className="hidden items-center md:flex">
        {nodes.map((node, idx) => (
          <Fragment key={node.id}>
            <FlowNode node={node} index={idx} isLast={idx === nodes.length - 1} />
            {idx < nodes.length - 1 && <FlowStream orientation="horizontal" />}
          </Fragment>
        ))}
      </div>

      {/* Вертикальный вариант (mobile) */}
      <div className="flex flex-col items-center md:hidden">
        {nodes.map((node, idx) => (
          <Fragment key={node.id}>
            <FlowNode node={node} index={idx} isLast={idx === nodes.length - 1} />
            {idx < nodes.length - 1 && <FlowStream orientation="vertical" />}
          </Fragment>
        ))}
      </div>
    </Card>
  );
}
