import type { ReactNode } from "react";

export interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Standard white card with an optional titled header and action slot. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: PanelProps) {
  const hasHeader = Boolean(title || actions);

  return (
    <section className={`bg-white rounded border border-[#dee2e6] ${className}`}>
      {hasHeader ? (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#dee2e6]">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[14px] font-semibold text-[#1a1d23] truncate">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="text-[11px] text-[#6c757d] mt-0.5">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
