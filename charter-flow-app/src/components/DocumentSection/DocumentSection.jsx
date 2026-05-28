import { FolderOpen } from 'lucide-react';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import DownloadButton from './DownloadButton';

/**
 * Секция «Документация» — кнопки скачивания PDF-приложений.
 * На широких экранах располагаются в две колонки, на узких — в одну.
 */
export default function DocumentSection({ documents }) {
  return (
    <Card delay={0.3}>
      <SectionTitle
        title="Документация"
        subtitle="Акты и приложения к договору"
        icon={FolderOpen}
      />

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {documents.map((doc, idx) => (
          <DownloadButton key={doc.id} document={doc} delay={0.1 + idx * 0.08} />
        ))}
      </div>
    </Card>
  );
}
