import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ClipboardList,
  Package,
  PieChart,
  Repeat,
  ShieldAlert,
} from "lucide-react";
import type { MatchSuggestion } from "../types";
import { REPORTING_PERIOD } from "../data/company";
import { useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { ProgressBar } from "../components/ui/ProgressBar";
import { DiscrepancyTrendChart } from "../components/analytics/DiscrepancyTrendChart";
import { MONO, num, pct, peso, pesoCompact } from "../lib/format";

/**
 * The reconciliation overview.
 *
 * Every headline number is read from `kpis`, which the API computes in Postgres
 * (`rpc_dashboard_kpis`) rather than being recalculated here. That is what stops
 * the dashboard total from ever disagreeing with the register it summarises.
 */
export function DashboardPage() {
  const {
    company,
    kpis,
    analytics,
    discrepancies,
    suggestions,
    matchSummary,
    branches,
    stock,
    transfers,
    branchShortName,
    permissions,
    busy,
    acceptSuggestion,
  } = useSystemStore();

  const [message, setMessage] = useState<string | null>(null);

  const openTickets = discrepancies.filter(
    (d) => d.status === "Locked" || d.status === "Under Review",
  );

  /** Per-branch roll-up, derived from the store's stock so it tracks approvals. */
  const branchSummary = useMemo(
    () =>
      branches.map((branch) => {
        const rows = stock.filter((row) => row.branchId === branch.id);
        const healthyRows = rows.filter((row) => row.onHand >= row.part.reorderPoint).length;
        return {
          branchId: branch.id,
          shortName: branch.shortName,
          units: rows.reduce((sum, row) => sum + row.onHand, 0),
          value: rows.reduce((sum, row) => sum + row.value, 0),
          deadStock: rows.filter((row) => row.isDeadStock).length,
          positions: rows.length,
          healthy: healthyRows,
          healthPct: rows.length === 0 ? 0 : (healthyRows / rows.length) * 100,
        };
      }),
    [branches, stock],
  );

  const healthyTotal = branchSummary.reduce((sum, row) => sum + row.healthy, 0);
  const autoSuggestedCount = transfers.filter((t) => t.autoSuggested).length;

  async function accept(suggestion: MatchSuggestion) {
    setMessage(null);
    try {
      await acceptSuggestion(suggestion);
      setMessage(
        `Transfer requested: ${suggestion.suggestedQty} × ${suggestion.sku} from ${branchShortName(
          suggestion.fromBranchId,
        )} to ${branchShortName(suggestion.toBranchId)}.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not accept that suggestion.");
    }
  }

  const pillars = [
    {
      to: "/cycle-counts",
      icon: ClipboardList,
      title: "Targeted Cycle Counting",
      description: "Prioritised daily audits with printable blind-count sheets.",
      metric: `${num(kpis.deadStockCount + openTickets.length)} bins flagged`,
    },
    {
      to: "/discrepancies",
      icon: ShieldAlert,
      title: "Discrepancy Approval",
      description: "Locked records routed to branch managers for sign-off.",
      metric: `${num(openTickets.length)} awaiting approval`,
    },
    {
      to: "/matchmaker",
      icon: Repeat,
      title: "Dead-Stock Matchmaker",
      description: "Idle stock matched to shortages across the network.",
      metric: `${pesoCompact(matchSummary.capitalRecovered)} recoverable`,
    },
    {
      to: "/analytics",
      icon: PieChart,
      title: "Discrepancy Analytics",
      description: "Frequency, cost and root causes for management.",
      metric: `${num(discrepancies.length)} tickets analysed`,
    },
  ];

  const branchColumns: Column<(typeof branchSummary)[number]>[] = [
    {
      key: "branch",
      header: "Branch",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
          <span className="text-[13px] text-[#1a1d23] font-medium">{row.shortName}</span>
        </div>
      ),
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(row.units)}
        </span>
      ),
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      render: (row) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {pesoCompact(row.value)}
        </span>
      ),
    },
    {
      key: "dead",
      header: "Dead stock",
      align: "right",
      render: (row) => (
        <span
          className={`text-[13px] whitespace-nowrap ${row.deadStock > 0 ? "text-red-600" : "text-[#6c757d]"}`}
          style={MONO}
        >
          {num(row.deadStock)}
        </span>
      ),
    },
    {
      key: "health",
      header: "Stock health",
      render: (row) => (
        <div className="w-32">
          <ProgressBar
            value={row.healthPct}
            tone={row.healthPct >= 75 ? "green" : row.healthPct >= 50 ? "amber" : "red"}
            label={`${row.shortName} stock health ${row.healthPct.toFixed(0)} percent`}
          />
        </div>
      ),
    },
  ];

  const suggestionColumns: Column<MatchSuggestion>[] = [
    {
      key: "part",
      header: "Part",
      render: (s) => (
        <div className="min-w-0 max-w-[220px]">
          <div className="text-[12px] text-[#495057] font-medium" style={MONO}>
            {s.sku}
          </div>
          <div className="text-[13px] text-[#1a1d23] truncate">{s.partName}</div>
        </div>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (s) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
          <span className="text-[#495057]">{branchShortName(s.fromBranchId)}</span>
          <ArrowRight size={11} className="text-[#adb5bd]" aria-hidden="true" />
          <span className="text-[#1a1d23] font-medium">{branchShortName(s.toBranchId)}</span>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (s) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(s.suggestedQty)}
        </span>
      ),
    },
    {
      key: "value",
      header: "Recoverable",
      align: "right",
      render: (s) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(s.recoveryValue)}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (s) =>
        permissions.canDismissSuggestions ? (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void accept(s)}>
            Accept
          </Button>
        ) : (
          <span className="text-[11px] text-[#adb5bd]">View only</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {message ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded px-4 py-3"
        >
          <p className="text-[12px] text-[#854f0b] leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
            className="text-[#854f0b] shrink-0 text-[12px]"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Inventory value"
          value={pesoCompact(kpis.totalValue)}
          sub={`${num(kpis.totalUnits)} units · ${num(kpis.totalPositions)} positions`}
          accent="blue"
        />
        <KpiCard
          label="Dead stock"
          value={pesoCompact(kpis.deadStockValue)}
          sub={`${num(kpis.deadStockCount)} positions idle 90+ days`}
          trend="down"
          delta="Recoverable via transfer"
          accent="red"
        />
        <KpiCard
          label="Open discrepancies"
          value={num(kpis.openDiscrepancies)}
          sub={`${pesoCompact(kpis.lockedValue)} capital locked`}
          accent="amber"
        />
        <KpiCard
          label="Capital recoverable"
          value={pesoCompact(matchSummary.capitalRecovered)}
          sub={`${num(matchSummary.suggestions)} match suggestions`}
          trend="up"
          delta="Without new procurement"
          accent="green"
        />
        <KpiCard
          label="Count accuracy"
          value={pct(kpis.countAccuracy, 1)}
          sub={`${num(
            kpis.totalPositions -
              new Set(discrepancies.map((d) => `${d.sku}|${d.branchId}`)).size,
          )} of ${num(kpis.totalPositions)} positions clean`}
          accent="green"
        />
      </div>

      <section aria-label="System modules" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {pillars.map(({ to, icon: Icon, title, description, metric }) => (
          <Link
            key={to}
            to={to}
            className="bg-white rounded border border-[#dee2e6] p-4 hover:shadow-sm hover:border-[#adb5bd] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded bg-blue-50 flex items-center justify-center shrink-0">
                <Icon size={14} className="text-blue-600" aria-hidden="true" />
              </div>
              <h2 className="text-[13px] font-semibold text-[#1a1d23]">{title}</h2>
            </div>
            <p className="text-[11px] text-[#6c757d] leading-relaxed mb-2">{description}</p>
            <p className="text-[12px] font-medium text-blue-600">{metric}</p>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2"
          title="Discrepancy trend"
          subtitle={`Tickets raised and decided per month, with the open backlog — ${REPORTING_PERIOD}`}
          bodyClassName="p-5"
        >
          <DiscrepancyTrendChart data={analytics.byMonth} variant="compact" />
        </Panel>

        <Panel
          title="Reconciliation snapshot"
          subtitle={company.name}
          bodyClassName="p-5 space-y-4"
        >
          {[
            {
              label: "Count accuracy",
              value: kpis.countAccuracy,
              tone: "green",
              hint: `${num(
                new Set(discrepancies.map((d) => `${d.sku}|${d.branchId}`)).size,
              )} positions with tickets`,
            },
            {
              label: "Stock health",
              value: kpis.stockHealth,
              tone: "blue",
              hint: `${num(healthyTotal)} of ${num(kpis.totalPositions)} at healthy level`,
            },
            {
              label: "Dead stock share",
              value:
                kpis.totalPositions === 0
                  ? 0
                  : (kpis.deadStockCount / kpis.totalPositions) * 100,
              tone: "red",
              hint: `${num(kpis.deadStockCount)} idle positions`,
            },
            {
              label: "Tickets resolved",
              value:
                discrepancies.length === 0
                  ? 0
                  : ((discrepancies.length - openTickets.length) / discrepancies.length) * 100,
              tone: "blue",
              hint: `${num(openTickets.length)} still open`,
            },
            {
              label: "Suggestions actioned",
              value:
                suggestions.length + autoSuggestedCount === 0
                  ? 0
                  : (autoSuggestedCount / (suggestions.length + autoSuggestedCount)) * 100,
              tone: "amber",
              hint: `${num(autoSuggestedCount)} accepted`,
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[12px] font-medium text-[#1a1d23]">{item.label}</span>
                <span className="text-[11px] text-[#6c757d]">{item.hint}</span>
              </div>
              <ProgressBar
                value={item.value}
                tone={item.tone}
                label={`${item.label}: ${item.value.toFixed(0)} percent`}
                showValue={false}
              />
            </div>
          ))}
          <Link
            to="/analytics"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-800 transition-colors pt-1"
          >
            View full analytics
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </Panel>
      </div>

      <Panel
        title="Dead-stock reallocation queue"
        subtitle={`${num(suggestions.length)} open matches ranked by match score`}
        actions={
          <Link
            to="/matchmaker"
            className="inline-flex items-center gap-1.5 text-[12px] text-[#6c757d] border border-[#dee2e6] rounded px-3 h-8 bg-white hover:bg-[#f8f9fa] transition-colors"
          >
            Open matchmaker
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        }
      >
        <DataTable
          caption="Top dead-stock reallocation suggestions"
          columns={suggestionColumns}
          rows={suggestions.slice(0, 6)}
          rowKey={(s) => `${s.sku}-${s.fromBranchId}-${s.toBranchId}`}
        />
      </Panel>

      <Panel
        title="Branch network"
        subtitle={`${branches.length} branches · stock position and accuracy`}
        actions={
          <Link
            to="/inventory"
            className="inline-flex items-center gap-1.5 text-[12px] text-[#6c757d] border border-[#dee2e6] rounded px-3 h-8 bg-white hover:bg-[#f8f9fa] transition-colors"
          >
            <Package size={12} aria-hidden="true" />
            View inventory
          </Link>
        }
      >
        <DataTable
          caption="Branch stock position and accuracy"
          columns={branchColumns}
          rows={branchSummary}
          rowKey={(row) => row.branchId}
        />
      </Panel>

      <Panel
        title="Recent discrepancy activity"
        subtitle="Latest tickets raised across the network"
        actions={<StatusBadge status={`${openTickets.length} open`} />}
      >
        <ul className="divide-y divide-[#f0f2f5]">
          {discrepancies.slice(0, 5).map((ticket) => (
            <li key={ticket.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <div className="text-[12px] text-[#1a1d23] font-medium truncate">
                  <span style={MONO}>{ticket.sku}</span> · {branchShortName(ticket.branchId)} ·{" "}
                  <span style={MONO}>{ticket.binLocation}</span>
                </div>
                <div className="text-[11px] text-[#6c757d] mt-0.5">
                  {ticket.id} raised by {ticket.raisedBy}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[12px] font-medium ${ticket.variance < 0 ? "text-red-600" : "text-green-600"}`}
                  style={MONO}
                >
                  {ticket.variance > 0 ? "+" : ""}
                  {num(ticket.variance)}
                </span>
                <StatusBadge status={ticket.status} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
