import { statusClass } from "../../theme";

/** Single status pill used by every table in the system. */
export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${statusClass(status)} ${className}`}
    >
      {status}
    </span>
  );
}
