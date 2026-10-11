import { useMemo, useState } from "react";
import { ArrowRight, Check, Info, Repeat, X } from "lucide-react";
import type { MatchSuggestion } from "../types";
import { suggestionKey, useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { Paginator } from "../components/ui/Paginator";
import { EmptyState } from "../components/ui/EmptyState";
import { ProgressBar } from "../components/ui/ProgressBar";
import { MONO, num, peso } from "../lib/format";

/**
 * Objective 4 — the dead-stock matchmaker.
 *
 * Only undecided suggestions arrive from the API: the server suppresses any
 * pair that already has a live transfer or a recorded dismissal. That is why
 * there is no accept/dismiss bookkeeping in this component — the decision is
 * durable in the database, so it survives a reload and follows the user to
 * another device.
 */
export function MatchmakerPage() {
  const {
    suggestions,
    matchSummary,
    branches,
    branchShortName,
    permissions,
    busy,
    acceptSuggestion,
    dismissSuggestion,
  } = useSystemStore();

  const [targetFilter, setTargetFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const perPage = 10;

  const visible = useMemo(
    () =>
      suggestions.filter((s) => targetFilter === "ALL" || s.toBranchId === targetFilter),
    [suggestions, targetFilter],
  );

  const rows = visible.slice((page - 1) * perPage, page * perPage);

  async function decide(action: "accept" | "dismiss", suggestion: MatchSuggestion) {
    setMessage(null);
    try {
      if (action === "accept") {
        await acceptSuggestion(suggestion);
        setMessage(
          `Transfer requested: ${suggestion.suggestedQty} × ${suggestion.sku} from ${branchShortName(
            suggestion.fromBranchId,
          )} to ${branchShortName(suggestion.toBranchId)}. It now appears in the transfers register.`,
        );
      } else {
        await dismissSuggestion(suggestion);
        setMessage(
          `Suggestion for ${suggestion.sku} dismissed. It will not be proposed again.`,
        );
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not record that decision.");
    }
  }

  const columns: Column<MatchSuggestion>[] = [
    {
      key: "part",
      header: "Part",
      render: (s) => (
        <div className="min-w-0 max-w-[240px]">
          <div className="text-[12px] text-[#495057] font-medium" style={MONO}>
            {s.sku}
          </div>
          <div className="text-[13px] text-[#1a1d23] truncate">{s.partName}</div>
        </div>
      ),
    },
    {
      key: "route",
      header: "Reallocation route",
      render: (s) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
          <span className="text-[#495057]">{branchShortName(s.fromBranchId)}</span>
          <ArrowRight size={11} className="text-[#adb5bd]" aria-hidden="true" />
          <span className="text-[#1a1d23] font-medium">{branchShortName(s.toBranchId)}</span>
        </div>
      ),
    },
    {
      key: "idle",
      header: "Idle capital",
      align: "right",
      render: (s) => (
        <div className="whitespace-nowrap text-right">
          <div className="text-[13px] text-[#1a1d23]" style={MONO}>
            {num(s.availableQty)}
          </div>
          <div className="text-[11px] text-[#6c757d]">{s.daysIdle} days idle</div>
        </div>
      ),
    },
    {
      key: "shortfall",
      header: "Shortfall",
      align: "right",
      render: (s) => (
        <span className="text-[13px] text-[#495057] whitespace-nowrap" style={MONO}>
          {num(s.shortfall)}
        </span>
      ),
    },
    {
      key: "suggested",
      header: "Suggested qty",
      align: "right",
      render: (s) => (
        <span className="text-[13px] font-semibold text-blue-600 whitespace-nowrap" style={MONO}>
          {num(s.suggestedQty)}
        </span>
      ),
    },
    {
      key: "value",
      header: "Capital recovered",
      align: "right",
      render: (s) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(s.recoveryValue)}
        </span>
      ),
    },
    {
      key: "score",
      header: "Match score",
      render: (s) => (
        <div className="w-24">
          <ProgressBar
            value={s.matchScore}
            max={100}
            tone={s.matchScore >= 70 ? "green" : s.matchScore >= 45 ? "blue" : "amber"}
            label={`Match score ${s.matchScore} of 100`}
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: () => <StatusBadge status="Suggested" />,
    },
    {
      key: "action",
      header: "Action",
      render: (s) => {
        if (!permissions.canDismissSuggestions) {
          return <span className="text-[11px] text-[#adb5bd] whitespace-nowrap">View only</span>;
        }
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Button
              size="sm"
              variant="primary"
              icon={Check}
              disabled={busy}
              onClick={() => void decide("accept", s)}
            >
              Accept
            </Button>
            <Button size="sm" icon={X} disabled={busy} onClick={() => void decide("dismiss", s)}>
              Dismiss
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded px-4 py-3">
        <Info size={14} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[12px] text-[#0c447c] leading-relaxed">
          <strong>How the matchmaker works.</strong> It cross-references parts that have not moved
          for 90+ days in one branch against branches sitting below their reorder point. Every
          accepted match becomes an inter-branch transfer request, so demand is fulfilled from
          company stock instead of new procurement. Decided suggestions drop off this list and are
          recorded, so the same idea is never proposed twice.
        </p>
      </div>

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
            className="text-[#854f0b] shrink-0"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Open suggestions"
          value={num(matchSummary.suggestions)}
          sub={`${matchSummary.partsMatched} distinct parts`}
          accent="blue"
        />
        <KpiCard
          label="Units to reallocate"
          value={num(matchSummary.unitsReallocated)}
          sub="Moving to where demand is"
          accent="amber"
        />
        <KpiCard
          label="Capital recovered"
          value={peso(matchSummary.capitalRecovered)}
          sub="Dead stock put back to work"
          trend="up"
          delta="Freed from idle inventory"
          accent="green"
        />
        <KpiCard
          label="Procurement avoided"
          value={peso(matchSummary.procurementAvoided)}
          sub="Purchases replaced by transfers"
          accent="green"
        />
      </div>

      <Panel
        title="Reallocation suggestions"
        subtitle={`${visible.length} matches, ranked by match score`}
        actions={
          <>
            <label htmlFor="mm-target" className="sr-only">
              Filter by receiving branch
            </label>
            <select
              id="mm-target"
              value={targetFilter}
              onChange={(event) => {
                setTargetFilter(event.target.value);
                setPage(1);
              }}
              className="text-[12px] text-[#495057] border border-[#dee2e6] rounded px-2.5 h-8 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All receiving branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </>
        }
      >
        <DataTable
          caption="Dead-stock reallocation suggestions ranked by match score"
          columns={columns}
          rows={rows}
          rowKey={(s) => suggestionKey(s)}
          empty={
            <EmptyState
              icon={Repeat}
              title="No matches to review"
              message="No idle stock currently lines up with a shortage at another branch."
            />
          }
        />
        <Paginator
          page={page}
          total={visible.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="matches"
        />
      </Panel>
    </div>
  );
}
