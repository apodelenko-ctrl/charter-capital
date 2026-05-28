import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import DownloadButton from './DownloadButton';

/**
 * Секция «Документация» — приложения к договору в виде скачиваемых PDF.
 */
export default function DocumentSection({ documents }) {
  return (
    <Card delay={0.15}>
      <SectionTitle
        eyebrow="Раздел 03 · Документация"
        title="Первичные документы"
        lead="Каждая стадия маршрута сопровождается соответствующим приложением к договору. Документы доступны для скачивания и архивирования."
      />

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {documents.map((doc, idx) => (
          <DownloadButton key={doc.id} document={doc} delay={0.1 + idx * 0.08} />
        ))}
      </div>
    </Card>
  );
}
