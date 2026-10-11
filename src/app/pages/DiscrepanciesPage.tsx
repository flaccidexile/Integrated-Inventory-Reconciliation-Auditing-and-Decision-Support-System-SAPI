import { useMemo, useState } from "react";
import { Info, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Discrepancy, RootCause } from "../types";
import { ROOT_CAUSE_VALUES } from "../../../shared/types";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilterTabs } from "../components/ui/FilterTabs";
import { Button } from "../components/ui/Button";
import { Paginator } from "../components/ui/Paginator";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { MONO, num, pct, peso, shortDate, signed } from "../lib/format";
import { useSystemStore } from "../store/SystemStore";

const STATUSES = ["All", "Locked", "Under Review", "Approved", "Rejected"] as const;
type StatusFilter = (typeof STATUSES)[number];

/**
 * Objective 2 — the approval register.
 *
 * A warehouse clerk can raise a ticket but cannot rule on it: the approve and
 * reject controls are hidden unless `permissions.canReviewDiscrepancies`, and
 * the API would refuse the call regardless, because the `discrepancies_update`
 * RLS policy is granted to management alone.
 */
export function DiscrepanciesPage() {
  const {
    discrepancies,
    branches,
    branchById,
    branchShortName,
    partName,
    permissions,
    reviewDiscrepancy,
  } = useSystemStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<Discrepancy | null>(null);
  const [cause, setCause] = useState<RootCause | "">("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perPage = 10;

  const open = discrepancies.filter((d) => d.status === "Locked" || d.status === "Under Review");
  const resolved = discrepancies.filter((d) => d.status === "Approved" || d.status === "Rejected");
  const approved = discrepancies.filter((d) => d.status === "Approved");
  const lockedValue = open.reduce((sum, d) => sum + d.varianceValue, 0);
  const approvalRate = resolved.length === 0 ? 0 : (approved.length / resolved.length) * 100;

  const filtered = useMemo(
    () =>
      discrepancies.filter(
        (d) =>
          (statusFilter === "All" || d.status === statusFilter) &&
          (branchFilter === "ALL" || d.branchId === branchFilter),
      ),
    [discrepancies, statusFilter, branchFilter],
  );

  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  function openReview(ticket: Discrepancy) {
    setReview(ticket);
    setCause(ticket.rootCause ?? "");
    setNotes(ticket.notes);
    setError(null);
  }

  async function submit(decision: "Approved" | "Rejected") {
    if (!review) return;
    setWorking(true);
    setError(null);
    try {
      await reviewDiscrepancy(review.id, decision, cause === "" ? null : cause, notes);
      setReview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record that decision.");
    } finally {
      setWorking(false);
    }
  }

  const columns: Column<Discrepancy>[] = [
    {
      key: "id",
      header: "Ticket",
      render: (d) => (
        <span className="text-[12px] text-blue-600 font-medium whitespace-nowrap" style={MONO}>
          {d.id}
        </span>
      ),
    },
    {
      key: "part",
      header: "Part",
      render: (d) => (
        <div className="min-w-0 max-w-[240px]">
          <div className="text-[12px] text-[#495057] font-medium" style={MONO}>
            {d.sku}
          </div>
          <div className="text-[13px] text-[#1a1d23] truncate">{partName(d.sku)}</div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      render: (d) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">
          {branchShortName(d.branchId)}
        </span>
      ),
    },
    {
      key: "qty",
      header: "System → Counted",
      align: "right",
      render: (d) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap" style={MONO}>
          {num(d.systemQty)} → {num(d.countedQty)}
        </span>
      ),
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      render: (d) => (
        <span
          className={`text-[13px] font-semibold whitespace-nowrap ${
            d.variance < 0 ? "text-red-600" : "text-green-600"
          }`}
          style={MONO}
        >
          {signed(d.variance)}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value at risk",
      align: "right",
      render: (d) => (
        <span className="text-[13px] text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(d.varianceValue)}
        </span>
      ),
    },
    {
      key: "cause",
      header: "Root cause",
      render: (d) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">
          {d.rootCause ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => (
        <div className="flex items-center gap-1.5">
          {d.status === "Locked" ? (
            <Lock size={11} className="text-red-500 shrink-0" aria-hidden="true" />
          ) : null}
          <StatusBadge status={d.status} />
        </div>
      ),
    },
    {
      key: "raised",
      header: "Raised",
      render: (d) => (
        <div className="whitespace-nowrap">
          <div className="text-[12px] text-[#495057]">{shortDate(d.raisedAt)}</div>
          <div className="text-[11px] text-[#6c757d]">{d.raisedBy}</div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (d) => (
        <Button
          size="sm"
          variant={d.status === "Locked" || d.status === "Under Review" ? "primary" : "secondary"}
          icon={ShieldCheck}
          onClick={() => openReview(d)}
        >
          {d.status === "Locked" || d.status === "Under Review"
            ? permissions.canReviewDiscrepancies
              ? "Review"
              : "Inspect"
            : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded px-4 py-3">
        <Info size={14} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[12px] text-[#0c447c] leading-relaxed">
          <strong>Approval workflow.</strong> A mismatched count locks the inventory record the
          moment it is encoded. No quantity changes until the branch manager records a root cause
          and digitally approves the adjustment — every decision is attributed and timestamped.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Open tickets"
          value={num(open.length)}
          sub="Locked or under review"
          trend={open.length > 0 ? "up" : "neutral"}
          delta={`${open.filter((d) => d.status === "Locked").length} awaiting first review`}
          accent="amber"
        />
        <KpiCard
          label="Capital locked"
          value={peso(lockedValue)}
          sub="Frozen pending approval"
          accent="red"
        />
        <KpiCard
          label="Approval rate"
          value={pct(approvalRate, 0)}
          sub={`${approved.length} of ${resolved.length} resolved`}
          accent="green"
        />
        <KpiCard
          label="Total tickets"
          value={num(discrepancies.length)}
          sub="Since February 2026"
          accent="blue"
        />
      </div>

      <Panel
        title="Discrepancy tickets"
        subtitle={`${filtered.length} tickets match the current filters`}
        actions={
          <>
            <label htmlFor="dsc-branch" className="sr-only">
              Filter by branch
            </label>
            <select
              id="dsc-branch"
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setPage(1);
              }}
              className="text-[12px] text-[#495057] border border-[#dee2e6] rounded px-2.5 h-8 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <FilterTabs
              label="Filter by status"
              options={STATUSES}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            />
          </>
        }
      >
        <DataTable
          caption="Discrepancy tickets and their approval status"
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          empty={
            <EmptyState
              icon={ShieldAlert}
              title="No discrepancies"
              message="No tickets match the current branch and status filters."
            />
          }
        />
        <Paginator
          page={page}
          total={filtered.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="tickets"
        />
      </Panel>

      <Modal
        open={review !== null}
        onClose={() => setReview(null)}
        title={review ? `Review ${review.id}` : ""}
        subtitle={
          review
            ? `${review.binLocation} · ${branchById(review.branchId)?.name ?? review.branchId}`
            : ""
        }
        widthClass="max-w-xl"
        footer={
          review &&
          (review.status === "Locked" || review.status === "Under Review") &&
          permissions.canReviewDiscrepancies ? (
            <>
              <Button variant="secondary" disabled={working} onClick={() => void submit("Rejected")}>
                Reject adjustment
              </Button>
              <Button
                variant="primary"
                disabled={cause === "" || working}
                onClick={() => void submit("Approved")}
              >
                {working ? "Recording…" : "Approve adjustment"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setReview(null)}>Close</Button>
          )
        }
      >
        {review ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "System qty", value: num(review.systemQty) },
                { label: "Counted qty", value: num(review.countedQty) },
                { label: "Variance", value: signed(review.variance) },
                { label: "Value at risk", value: peso(review.varianceValue) },
              ].map((item) => (
                <div key={item.label} className="bg-[#f8f9fa] border border-[#dee2e6] rounded p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                    {item.label}
                  </div>
                  <div className="text-[13px] text-[#1a1d23] font-medium" style={MONO}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <span className="text-[#6c757d]">Part: </span>
                <span className="text-[#1a1d23]">
                  {partName(review.sku)} <span style={MONO}>({review.sku})</span>
                </span>
              </div>
              <div>
                <span className="text-[#6c757d]">Raised by: </span>
                <span className="text-[#1a1d23]">
                  {review.raisedBy} on {shortDate(review.raisedAt)}
                </span>
              </div>
              <div>
                <span className="text-[#6c757d]">Branch manager: </span>
                <span className="text-[#1a1d23]">
                  {branchById(review.branchId)?.manager ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-[#6c757d]">Status: </span>
                <StatusBadge status={review.status} />
              </div>
            </div>

            {review.status === "Locked" || review.status === "Under Review" ? (
              <>
                {!permissions.canReviewDiscrepancies ? (
                  <div className="rounded border border-[#ffe69c] bg-[#fff9e6] px-3 py-2.5 text-[12px] text-[#7a5c00]">
                    This ticket is waiting on a management decision. You can read it, but only
                    management can approve or reject the adjustment.
                  </div>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-3 py-2 text-[12px] text-[#842029]"
                  >
                    {error}
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="root-cause"
                    className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
                  >
                    Root cause (required to approve)
                  </label>
                  <select
                    id="root-cause"
                    value={cause}
                    disabled={!permissions.canReviewDiscrepancies}
                    onChange={(event) => setCause(event.target.value as RootCause | "")}
                    className="w-full h-9 px-3 text-[13px] text-[#1a1d23] border border-[#dee2e6] rounded bg-[#f8f9fa] outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  >
                    <option value="">Select a root cause…</option>
                    {ROOT_CAUSE_VALUES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="review-notes"
                    className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
                  >
                    Investigation notes
                  </label>
                  <textarea
                    id="review-notes"
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full px-3 py-2 text-[13px] text-[#1a1d23] border border-[#dee2e6] rounded bg-[#f8f9fa] outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="What was found during the investigation?"
                  />
                </div>
              </>
            ) : (
              <div className="bg-[#f8f9fa] border border-[#dee2e6] rounded p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  Resolution
                </div>
                <p className="text-[12px] text-[#1a1d23]">
                  {review.status === "Approved" ? "Adjustment approved" : "Adjustment rejected"} by{" "}
                  {review.reviewedBy ?? "—"}
                  {review.reviewedAt ? ` on ${shortDate(review.reviewedAt)}` : ""}.
                  {review.rootCause ? ` Root cause recorded as “${review.rootCause}”.` : ""}
                </p>
                {review.notes ? (
                  <p className="text-[12px] text-[#6c757d] mt-1">{review.notes}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
