import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DiscrepancyByMonth } from "../../types";
import { MONO, num, peso, pesoCompact } from "../../lib/format";

/**
 * The monthly discrepancy trend.
 *
 * The original version of this chart plotted "Opened" and "Resolved" as two
 * bars and a cost line, and was close to unreadable: resolution was keyed on the
 * month a ticket was *raised* rather than the month it was *decided*, so the two
 * bar series were identical in almost every month, and the reader had no way to
 * tell which axis belonged to which unit.
 *
 * Three things make it legible now:
 *
 *   1. The series mean what they say. `resolved` counts decisions taken in the
 *      month, so the gap between the bars is the backlog accumulating (or
 *      draining), which is the whole point of the chart.
 *   2. The right-hand line is switchable between variance cost and the open
 *      backlog, so the two questions management actually asks — "what did this
 *      cost?" and "are we keeping up?" — each get a chart without crowding one.
 *   3. Units are stated: the tooltip formats money as pesos and counts as
 *      integers, the count axis refuses fractional ticks, and every series is
 *      named in the legend.
 */

type RightMetric = "cost" | "backlog";
type BarKey = "opened" | "resolved";

const BAR_COLOR: Record<BarKey, string> = {
  opened: "#0d6efd",
  resolved: "#198754",
};

const RIGHT_SERIES: Record<RightMetric, { label: string; short: string; color: string }> = {
  cost: { label: "Variance cost", short: "Cost", color: "#ba7517" },
  backlog: { label: "Open backlog", short: "Backlog", color: "#6f42c1" },
};

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: DiscrepancyByMonth }[];
  rightMetric?: RightMetric;
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[#495057]">
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        {label}
      </span>
      <span className="text-[#1a1d23] font-medium" style={MONO}>
        {value}
      </span>
    </div>
  );
}

function TrendTooltip({ active, payload, rightMetric = "cost" }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const net = row.opened - row.resolved;
  const line = RIGHT_SERIES[rightMetric];

  return (
    <div className="rounded border border-[#dee2e6] bg-white shadow-lg px-3 py-2.5 text-[11px] min-w-[188px]">
      <div className="text-[11px] font-semibold text-[#1a1d23] mb-2">{row.month}</div>

      <div className="space-y-1">
        <TooltipRow color={BAR_COLOR.opened} label="Opened" value={num(row.opened)} />
        <TooltipRow color={BAR_COLOR.resolved} label="Resolved" value={num(row.resolved)} />
        <TooltipRow
          color={line.color}
          label={line.label}
          value={rightMetric === "cost" ? peso(row.cost) : num(row.backlog)}
        />
      </div>

      <div className="mt-2 pt-2 border-t border-[#f0f2f5] flex items-center justify-between gap-4">
        <span className="text-[#6c757d]">Net this month</span>
        <span
          className={`font-semibold ${
            net > 0 ? "text-red-600" : net < 0 ? "text-green-600" : "text-[#6c757d]"
          }`}
          style={MONO}
        >
          {net > 0 ? `+${num(net)}` : num(net)}
        </span>
      </div>

      <p className="mt-1.5 text-[10px] text-[#adb5bd] leading-snug">
        {net > 0
          ? "More raised than decided — backlog grew."
          : net < 0
            ? "More decided than raised — backlog shrank."
            : "Raised and decided in step."}
      </p>
    </div>
  );
}

function LegendChip({
  color,
  label,
  muted,
  onClick,
}: {
  color: string;
  label: string;
  muted: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className="w-2.5 h-2.5 rounded-sm shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-[#495057]">{label}</span>
    </>
  );

  if (!onClick) {
    return <span className="flex items-center gap-1.5 text-[11px]">{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!muted}
      title={muted ? `Show ${label}` : `Hide ${label}`}
      className={`flex items-center gap-1.5 text-[11px] rounded px-1 -mx-1 py-0.5 transition-opacity hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        muted ? "opacity-35" : ""
      }`}
    >
      {content}
    </button>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-red-600" : tone === "down" ? "text-green-600" : "text-[#1a1d23]";
  return (
    <div className="border-l-2 border-[#dee2e6] pl-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-0.5">
        {label}
      </div>
      <div className={`text-[14px] font-semibold ${toneClass}`} style={MONO}>
        {value}
      </div>
      <div className="text-[10px] text-[#adb5bd] mt-0.5">{hint}</div>
    </div>
  );
}

export function DiscrepancyTrendChart({
  data,
  variant = "full",
}: {
  data: DiscrepancyByMonth[];
  /**
   * "full"    the analytics page — toolbar, switchable right axis, summary strip.
   * "compact" the dashboard tile — the same series at a glance, no controls.
   */
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";
  const [rightMetric, setRightMetric] = useState<RightMetric>("cost");
  const [hidden, setHidden] = useState<Record<BarKey, boolean>>({
    opened: false,
    resolved: false,
  });

  const totals = useMemo(() => {
    let opened = 0;
    let resolved = 0;
    let cost = 0;
    let peak: DiscrepancyByMonth | null = null;

    for (const row of data) {
      opened += row.opened;
      resolved += row.resolved;
      cost += row.cost;
      if (!peak || row.opened > peak.opened) peak = row;
    }

    return { opened, resolved, cost, peak, backlog: data[data.length - 1]?.backlog ?? 0 };
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="text-[12px] text-[#6c757d] py-10 text-center">
        No discrepancy tickets have been recorded yet, so there is nothing to trend.
      </p>
    );
  }

  // The dashboard tile has no toolbar, so it always plots the backlog: at a
  // glance "are we keeping up?" is the more useful question than "what did it
  // cost?", and cost already has its own panel underneath it.
  const activeMetric: RightMetric = compact ? "backlog" : rightMetric;
  const line = RIGHT_SERIES[activeMetric];
  const net = totals.opened - totals.resolved;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3">
          <LegendChip
            color={BAR_COLOR.opened}
            label="Opened"
            muted={hidden.opened}
            onClick={
              compact ? undefined : () => setHidden((state) => ({ ...state, opened: !state.opened }))
            }
          />
          <LegendChip
            color={BAR_COLOR.resolved}
            label="Resolved"
            muted={hidden.resolved}
            onClick={
              compact
                ? undefined
                : () => setHidden((state) => ({ ...state, resolved: !state.resolved }))
            }
          />
          <LegendChip color={line.color} label={line.label} muted={false} />
        </div>

        {compact ? null : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#6c757d]">Right axis</span>
            <div
              role="group"
              aria-label="Choose the right-hand series"
              className="inline-flex rounded border border-[#dee2e6] overflow-hidden"
            >
              {(["cost", "backlog"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRightMetric(key)}
                  aria-pressed={rightMetric === key}
                  className={`px-2.5 h-7 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    rightMetric === key
                      ? "bg-[#1c2a3a] text-white font-medium"
                      : "bg-white text-[#6c757d] hover:bg-[#f8f9fa]"
                  }`}
                >
                  {RIGHT_SERIES[key].short}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={compact ? 220 : 288}>
        <ComposedChart
          data={data}
          margin={{ top: compact ? 10 : 16, right: 12, left: 0, bottom: 4 }}
          barGap={2}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#6c757d" }}
            axisLine={false}
            tickLine={false}
            dy={4}
          />
          <YAxis
            yAxisId="count"
            allowDecimals={false}
            width={30}
            tick={{ fontSize: 11, fill: "#6c757d" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            width={54}
            tick={{ fontSize: 11, fill: "#6c757d" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) =>
              activeMetric === "cost" ? pesoCompact(value) : num(value)
            }
          />
          <Tooltip
            content={<TrendTooltip rightMetric={activeMetric} />}
            cursor={{ fill: "#f0f2f5", fillOpacity: 0.55 }}
          />

          {hidden.opened ? null : (
            <Bar
              yAxisId="count"
              dataKey="opened"
              name="Opened"
              fill={BAR_COLOR.opened}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
          )}
          {hidden.resolved ? null : (
            <Bar
              yAxisId="count"
              dataKey="resolved"
              name="Resolved"
              fill={BAR_COLOR.resolved}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
          )}

          <Line
            yAxisId="right"
            type="monotone"
            dataKey={activeMetric}
            name={line.label}
            stroke={line.color}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, stroke: line.color, fill: "#ffffff" }}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {compact ? null : (
        <div className="mt-4 pt-3 border-t border-[#f0f2f5] grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <SummaryStat
            label="Raised"
            value={num(totals.opened)}
            hint={
              totals.peak ? `Peak ${totals.peak.month} · ${num(totals.peak.opened)}` : "Across the period"
            }
          />
          <SummaryStat
            label="Decided"
            value={num(totals.resolved)}
            hint="Approved or rejected"
          />
          <SummaryStat
            label="Net change"
            value={net > 0 ? `+${num(net)}` : num(net)}
            hint="Raised less decided"
            tone={net > 0 ? "up" : net < 0 ? "down" : "neutral"}
          />
          {activeMetric === "cost" ? (
            <SummaryStat
              label="Variance cost"
              value={pesoCompact(totals.cost)}
              hint="Financial impact of tickets raised"
            />
          ) : (
            <SummaryStat
              label="Open backlog"
              value={num(totals.backlog)}
              hint="Unresolved at period end"
            />
          )}
        </div>
      )}
    </div>
  );
}
