import { ACCENT_BORDER, ACCENT_TEXT, TREND_TEXT } from "../../theme";
import type { Trend } from "../../types";
import { TrendIcon } from "./TrendIcon";

export type Accent = "blue" | "green" | "red" | "amber";

export interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  trend?: Trend;
  delta?: string;
  accent?: Accent;
}

export function KpiCard({
  label,
  value,
  sub,
  trend = "neutral",
  delta,
  accent = "blue",
}: KpiCardProps) {
  return (
    <div
      className={`bg-white rounded border border-[#dee2e6] border-l-[3px] ${ACCENT_BORDER[accent]} p-4 hover:shadow-sm transition-shadow duration-150`}
    >
      <div className="text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-2">
        {label}
      </div>
      <div
        className={`text-2xl font-bold leading-none mb-1 ${ACCENT_TEXT[accent]}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="text-[11px] text-[#6c757d] mb-2">{sub}</div>
      {delta ? (
        <div className="flex items-center gap-1">
          <TrendIcon trend={trend} />
          <span className={`text-[11px] font-medium ${TREND_TEXT[trend]}`}>{delta}</span>
        </div>
      ) : null}
    </div>
  );
}
