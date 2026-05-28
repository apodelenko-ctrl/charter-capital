import { motion } from 'framer-motion';
import { Download, FileText } from 'lucide-react';

/**
 * Институциональная кнопка скачивания документа.
 * Светлая тема: белый фон, тонкая обводка, золотая иконка.
 *  - Атрибут download заставляет браузер скачивать, а не открывать PDF.
 */
export default function DownloadButton({ document, delay = 0 }) {
  return (
    <motion.a
      href={document.file}
      download
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -2 }}
      className="group flex items-start gap-4 rounded-lg border border-rule bg-white p-5 shadow-soft transition-all hover:border-gold-600/50 hover:shadow-card-hover sm:p-6"
    >
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-gold-600/30 bg-paper-100 text-gold-600 transition-transform group-hover:scale-105">
        <FileText size={20} strokeWidth={1.6} aria-hidden />
      </span>

      <span className="flex flex-1 flex-col text-left">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-institutional text-gold-700">
          {document.subtitle}
        </span>
        <span className="mt-1 font-sans text-[15px] font-semibold leading-tight text-ink sm:text-base">
          {document.title}
        </span>
        {document.description && (
          <span className="mt-1.5 text-[13px] leading-snug text-ink-600">
            {document.description}
          </span>
        )}
        {document.fileSize && (
          <span className="mt-2 font-mono text-[11px] text-ink-400">
            PDF · {document.fileSize}
          </span>
        )}
      </span>

      <span className="flex-shrink-0 transition-transform group-hover:translate-x-1">
        <Download
          size={18}
          strokeWidth={1.75}
          className="text-ink-400 transition-colors group-hover:text-gold-600"
          aria-hidden
        />
      </span>
    </motion.a>
  );
}
