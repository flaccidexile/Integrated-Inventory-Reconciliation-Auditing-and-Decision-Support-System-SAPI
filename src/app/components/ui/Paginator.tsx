import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Builds a windowed page list ("1 … 4 5 6 … 20") so the control stays usable
 * no matter how many rows the table holds.
 */
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const wanted = new Set([1, totalPages, current, current - 1, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const page of pages) {
    if (previous !== 0 && page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export interface PaginatorProps {
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
  itemLabel?: string;
}

export function Paginator({ page, total, perPage, onChange, itemLabel = "rows" }: PaginatorProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  const navButton =
    "w-7 h-7 flex items-center justify-center rounded border border-[#dee2e6] text-[#6c757d] hover:bg-[#f8f9fa] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-5 py-3 border-t border-[#dee2e6]"
    >
      <span className="text-[12px] text-[#6c757d]">
        Showing <strong className="text-[#1a1d23]">{start}–{end}</strong> of{" "}
        <strong className="text-[#1a1d23]">{total}</strong> {itemLabel}
      </span>

      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className={navButton}
          >
            <ChevronLeft size={13} aria-hidden="true" />
          </button>

          {pageWindow(page, totalPages).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-[11px] text-[#adb5bd]" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                aria-label={`Page ${entry}`}
                aria-current={page === entry ? "page" : undefined}
                onClick={() => onChange(entry)}
                className={`w-7 h-7 flex items-center justify-center rounded border text-[12px] font-medium transition-colors ${
                  page === entry
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-[#dee2e6] text-[#6c757d] hover:bg-[#f8f9fa]"
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Next page"
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className={navButton}
          >
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
