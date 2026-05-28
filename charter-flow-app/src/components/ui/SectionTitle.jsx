/**
 * Заголовок секции в институциональном стиле:
 *   - тонкая «брови»-надпись над заголовком (eyebrow)
 *   - сам заголовок крупно, серьёзная типографика
 *   - короткий лид-параграф (опционально)
 *   - тонкая золотая черта-разделитель
 */
export default function SectionTitle({ eyebrow, title, lead }) {
  return (
    <header className="mb-8 sm:mb-10">
      {eyebrow && <div className="section-eyebrow mb-3">{eyebrow}</div>}
      <h2 className="font-sans text-2xl font-semibold tracking-tight text-ink sm:text-[28px] md:text-[32px]">
        {title}
      </h2>
      {lead && (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          {lead}
        </p>
      )}
      <div className="gold-rule mt-6" />
    </header>
  );
}
