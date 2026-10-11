import { useMemo } from "react";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DiscrepancyByBranch, DiscrepancyByCause, RootCause } from "../types";
import { useSystemStore } from "../store/SystemStore";
import { CAUSE_COLORS, CHART_COLORS } from "../theme";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { DiscrepancyTrendChart } from "../components/analytics/DiscrepancyTrendChart";
import { MONO, num, pct, peso, pesoCompact } from "../lib/format";

export function AnalyticsPage() {
  const { discrepancies, analytics, branches } = useSystemStore();

  // The monthly, per-branch and per-cause breakdowns are computed in Postgres
  // (`rpc_discrepancy_analytics`) and arrive ready to chart. Only the resolution
  // statistics below are derived here, because they are a pure function of the
  // live ticket list and should update the instant a decision is recorded.
  const { byMonth, byBranch, byCause } = analytics;

  const stats = useMemo(() => {
    const total = discrepancies.length;
    const resolved = discrepancies.filter((d) => d.status === "Approved" || d.status === "Rejected");
    const approved = discrepancies.filter((d) => d.status === "Approved");
    const totalCost = discrepancies.reduce((sum, d) => sum + d.varianceValue, 0);
    const resolutionDays = resolved
      .filter((d) => d.reviewedAt)
      .map(
        (d) =>
          (new Date(d.reviewedAt as string).getTime() - new Date(d.raisedAt).getTime()) / 86_400_000,
      );

    return {
      total,
      open: total - resolved.length,
      totalCost,
      avgCost: total === 0 ? 0 : totalCost / total,
      approvalRate: resolved.length === 0 ? 0 : (approved.length / resolved.length) * 100,
      avgResolutionDays:
        resolutionDays.length === 0
          ? 0
          : resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length,
    };
  }, [discrepancies]);

  const totalCauseCount = byCause.reduce((sum, c) => sum + c.count, 0);

  const causeColumns: Column<DiscrepancyByCause>[] = [
    {
      key: "cause",
      header: "Root cause",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ backgroundColor: CAUSE_COLORS[row.cause] ?? "#adb5bd" }}
            aria-hidden="true"
          />
          <span className="text-[13px] text-[#1a1d23]">{row.cause}</span>
        </div>
      ),
    },
    {
      key: "count",
      header: "Tickets",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(row.count)}
        </span>
      ),
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      render: (row) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">
          {pct(totalCauseCount === 0 ? 0 : (row.count / totalCauseCount) * 100, 0)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Financial impact",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(row.cost)}
        </span>
      ),
    },
  ];

  const branchColumns: Column<DiscrepancyByBranch>[] = [
    {
      key: "branch",
      header: "Branch",
      render: (row) => <span className="text-[13px] text-[#1a1d23]">{row.shortName}</span>,
    },
    {
      key: "count",
      header: "Tickets",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(row.discrepancies)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Financial impact",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(row.cost)}
        </span>
      ),
    },
    {
      key: "accuracy",
      header: "Count accuracy",
      align: "right",
      render: (row) => (
        <span
          className={`text-[12px] whitespace-nowrap ${
            row.accuracyRate >= 80 ? "text-green-600" : "text-amber-600"
          }`}
        >
          {pct(row.accuracyRate, 0)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded px-4 py-3">
        <Info size={14} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[12px] text-[#0c447c] leading-relaxed">
          <strong>Decision support for management.</strong> Every figure below is derived live from
          the discrepancy tickets, so what you approve in the workflow is exactly what you see
          here — frequency, financial cost and root causes across all {branches.length} branches.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total discrepancies"
          value={num(stats.total)}
          sub="Feb – Oct 2026"
          accent="blue"
        />
        <KpiCard
          label="Open tickets"
          value={num(stats.open)}
          sub="Awaiting resolution"
          accent="amber"
        />
        <KpiCard
          label="Total variance cost"
          value={pesoCompact(stats.totalCost)}
          sub={`${peso(stats.avgCost)} average per ticket`}
          accent="red"
        />
        <KpiCard
          label="Avg resolution time"
          value={`${stats.avgResolutionDays.toFixed(1)}d`}
          sub="Raised to decided"
          accent="blue"
        />
        <KpiCard
          label="Approval rate"
          value={pct(stats.approvalRate, 0)}
          sub="Adjustments approved"
          accent="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2"
          title="Discrepancy volume and backlog"
          subtitle="Tickets raised and decided each month, with the financial impact or the open backlog"
          bodyClassName="p-5"
        >
          <DiscrepancyTrendChart data={byMonth} />
        </Panel>

        <Panel
          title="Root causes"
          subtitle={`${num(totalCauseCount)} resolved tickets classified`}
          bodyClassName="p-5"
        >
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={byCause}
                dataKey="count"
                nameKey="cause"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={76}
                paddingAngle={2}
              >
                {byCause.map((entry, index) => (
                  <Cell
                    key={entry.cause}
                    fill={CAUSE_COLORS[entry.cause] ?? CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#dee2e6", borderRadius: 4 }}
                formatter={(value: unknown) => [`${num(Number(value))} tickets`, "Count"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="grid grid-cols-1 gap-1 mt-2">
            {byCause.slice(0, 5).map((entry) => (
              <li key={entry.cause} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: CAUSE_COLORS[entry.cause] ?? "#adb5bd" }}
                  aria-hidden="true"
                />
                <span className="text-[11px] text-[#6c757d] truncate flex-1">{entry.cause}</span>
                <span className="text-[11px] text-[#495057]" style={MONO}>
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Financial impact by branch"
        subtitle="Where mismatch cost is concentrated across the network"
        bodyClassName="p-5"
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={byBranch}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#6c757d" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => pesoCompact(value)}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              width={80}
              tick={{ fontSize: 11, fill: "#6c757d" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderColor: "#dee2e6", borderRadius: 4 }}
              formatter={(value: unknown) => peso(Number(value))}
            />
            <Bar dataKey="cost" name="Variance cost" fill="#dc3545" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Root cause analysis" subtitle="Ranked by financial impact">
          <DataTable
            caption="Discrepancy root causes with ticket counts and financial impact"
            columns={causeColumns}
            rows={byCause}
            rowKey={(row) => row.cause}
          />
        </Panel>

        <Panel title="Branch scorecard" subtitle="Tickets, cost and stock accuracy per branch">
          <DataTable
            caption="Per-branch discrepancy cost and stock accuracy"
            columns={branchColumns}
            rows={byBranch}
            rowKey={(row) => row.branchId}
          />
        </Panel>
      </div>
    </div>
  );
}
