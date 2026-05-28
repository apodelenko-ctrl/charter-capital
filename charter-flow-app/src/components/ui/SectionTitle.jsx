/**
 * Заголовок секции с золотой подчёркивающей чертой.
 * Размер шрифта согласован между всеми блоками дашборда.
 */
export default function SectionTitle({ title, subtitle, icon: Icon }) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        )}
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-white/40 sm:text-[11px]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="gold-hairline mt-4" />
    </div>
  );
}
