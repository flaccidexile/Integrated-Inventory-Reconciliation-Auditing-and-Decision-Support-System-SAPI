import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

/** Accessible modal dialog: Escape to dismiss, backdrop click, labelled title. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  widthClass = "max-w-lg",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${widthClass} bg-white rounded border border-[#dee2e6] shadow-xl max-h-[90vh] flex flex-col`}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#dee2e6]">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-[14px] font-semibold text-[#1a1d23]">
              {title}
            </h2>
            {subtitle ? <p className="text-[11px] text-[#6c757d] mt-0.5">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-[#6c757d] hover:text-[#1a1d23] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="px-5 py-3.5 border-t border-[#dee2e6] flex items-center justify-end gap-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
