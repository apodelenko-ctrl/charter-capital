import { motion } from 'framer-motion';
import { Download, FileText } from 'lucide-react';

/**
 * Премиум-кнопка скачивания документа.
 *  - Иконка слева (FileText)
 *  - Заголовок + подзаголовок (приложение №)
 *  - Иконка Download справа со сдвигом при hover
 *  - Атрибут download заставляет браузер скачивать, а не открывать PDF
 */
export default function DownloadButton({ document, delay = 0 }) {
  return (
    <motion.a
      href={document.file}
      download
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -2 }}
      className="group flex items-center gap-4 rounded-xl border border-white/10 bg-abyss-700/50 p-4 transition-colors hover:border-gold/40 hover:bg-gold/[0.04] sm:p-5"
    >
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/5 text-gold transition-transform group-hover:scale-105">
        <FileText size={20} strokeWidth={1.6} aria-hidden />
      </span>

      <span className="flex flex-1 flex-col text-left">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          {document.subtitle}
        </span>
        <span className="mt-0.5 font-sans text-[14px] font-semibold leading-tight text-white sm:text-[15px]">
          {document.title}
        </span>
        {document.fileSize && (
          <span className="mt-1 font-mono text-[11px] text-white/40">
            PDF · {document.fileSize}
          </span>
        )}
      </span>

      <span className="flex-shrink-0 transition-transform group-hover:translate-x-1">
        <Download
          size={18}
          strokeWidth={1.75}
          className="text-white/40 transition-colors group-hover:text-gold"
          aria-hidden
        />
      </span>
    </motion.a>
  );
}
