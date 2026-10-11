import { useMemo, useState } from "react";
import { ArrowRight, Plus, Repeat } from "lucide-react";
import type { Transfer, TransferStatus } from "../types";
import { useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilterTabs } from "../components/ui/FilterTabs";
import { Paginator } from "../components/ui/Paginator";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { MONO, num, shortDate } from "../lib/format";

const STATUSES = ["All", "Pending", "Approved", "In Transit", "Completed", "Rejected"] as const;
type StatusFilter = (typeof STATUSES)[number];

/**
 * The next step in the transfer pipeline, or null at a terminal state.
 *
 * Kept as a single map so the button label, the button's visibility and the
 * server-side guard all read from the same definition of "forward".
 */
const NEXT_STATUS: Partial<Record<TransferStatus, TransferStatus>> = {
  Pending: "Approved",
  Approved: "In Transit",
  "In Transit": "Completed",
};

const inputClass =
  "w-full h-9 px-3 text-[13px] text-[#1a1d23] border border-[#dee2e6] rounded bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all";

export function TransfersPage() {
  const {
    transfers,
    branches,
    parts,
    stock,
    branchShortName,
    permissions,
    busy,
    setTransferStatus,
    requestTransfer,
  } = useSystemStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const perPage = 12;

  /* ── Request-transfer dialog state ───────────────────────────────────── */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftSku, setDraftSku] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      transfers.filter((transfer) => {
        const matchesStatus = statusFilter === "All" || transfer.status === statusFilter;
        const matchesRoute =
          routeFilter === "ALL" ||
          transfer.fromBranchId === routeFilter ||
          transfer.toBranchId === routeFilter;
        return matchesStatus && matchesRoute;
      }),
    [transfers, statusFilter, routeFilter],
  );

  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  const countBy = (status: TransferStatus) => transfers.filter((t) => t.status === status).length;
  const unitsMoving = transfers
    .filter((t) => t.status === "Approved" || t.status === "In Transit")
    .reduce((sum, t) => sum + t.qty, 0);
  const autoSuggested = transfers.filter((t) => t.autoSuggested).length;

  /** Stock on hand at the source branch for the part being requested. */
  const availableAtSource = useMemo(() => {
    if (!draftSku || !draftFrom) return null;
    const position = stock.find((row) => row.sku === draftSku && row.branchId === draftFrom);
    return position?.onHand ?? 0;
  }, [stock, draftSku, draftFrom]);

  function openDialog() {
    const firstPart = parts[0];
    const firstBranch = branches[0];
    setDraftSku(firstPart?.sku ?? "");
    setDraftFrom(firstBranch?.id ?? "");
    setDraftTo(branches.find((b) => b.id !== firstBranch?.id)?.id ?? "");
    setDraftQty("1");
    setFormError(null);
    setDialogOpen(true);
  }

  async function submitRequest() {
    const qty = Number.parseInt(draftQty, 10);
    if (!draftSku || !draftFrom || !draftTo) {
      setFormError("Pick a part and both branches.");
      return;
    }
    if (draftFrom === draftTo) {
      setFormError("The source and destination branch must differ.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be a positive whole number.");
      return;
    }

    try {
      await requestTransfer({
        sku: draftSku,
        fromBranchId: draftFrom,
        toBranchId: draftTo,
        qty,
      });
      setDialogOpen(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not raise the transfer.");
    }
  }

  async function advance(transfer: Transfer) {
    const next = NEXT_STATUS[transfer.status];
    if (!next) return;
    try {
      await setTransferStatus(transfer.id, next);
    } catch {
      // The store re-reads on success; on failure the table simply stays as it
      // was, which is the honest outcome — the server rejected the move.
    }
  }

  const columns: Column<Transfer>[] = [
    {
      key: "id",
      header: "Transfer",
      render: (t) => (
        <div className="whitespace-nowrap">
          <div className="text-[12px] text-blue-600 font-medium" style={MONO}>
            {t.id}
          </div>
          {t.autoSuggested ? (
            <div className="text-[10px] text-[#6c757d] flex items-center gap-1 mt-0.5">
              <Repeat size={9} aria-hidden="true" />
              Matchmaker
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "part",
      header: "Part",
      render: (t) => (
        <div className="min-w-0 max-w-[220px]">
          <div className="text-[12px] text-[#495057] font-medium" style={MONO}>
            {t.sku}
          </div>
          <div className="text-[13px] text-[#1a1d23] truncate">{t.partName}</div>
        </div>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (t) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
          <span className="text-[#495057]">{branchShortName(t.fromBranchId)}</span>
          <ArrowRight size={11} className="text-[#adb5bd]" aria-hidden="true" />
          <span className="text-[#1a1d23] font-medium">{branchShortName(t.toBranchId)}</span>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (t) => (
        <span className="text-[13px] font-semibold text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(t.qty)}
        </span>
      ),
    },
    {
      key: "requestedBy",
      header: "Requested by",
      render: (t) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">{t.requestedBy}</span>
      ),
    },
    {
      key: "date",
      header: "Raised",
      render: (t) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">{shortDate(t.date)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (t) => {
        const next = NEXT_STATUS[t.status];
        if (!permissions.canExecuteTransfers || !next) {
          return <span className="text-[11px] text-[#adb5bd]">—</span>;
        }
        return (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void advance(t)}
            aria-label={`Move ${t.id} to ${next}`}
          >
            {next}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total transfers"
          value={num(transfers.length)}
          sub={`${num(autoSuggested)} from the matchmaker`}
          accent="blue"
        />
        <KpiCard
          label="Pending approval"
          value={num(countBy("Pending"))}
          sub="Awaiting branch sign-off"
          accent="amber"
        />
        <KpiCard
          label="In transit"
          value={num(countBy("In Transit"))}
          sub={`${num(unitsMoving)} units moving`}
          accent="blue"
        />
        <KpiCard
          label="Completed"
          value={num(countBy("Completed"))}
          sub="Delivered and received"
          accent="green"
        />
      </div>

      <Panel
        title="Inter-branch transfer requests"
        subtitle={`${filtered.length} transfers match the current filters`}
        actions={
          <>
            <label htmlFor="trf-branch" className="sr-only">
              Filter by branch
            </label>
            <select
              id="trf-branch"
              value={routeFilter}
              onChange={(event) => {
                setRouteFilter(event.target.value);
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
              label="Filter by transfer status"
              options={STATUSES}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            />
            {permissions.canRequestTransfer ? (
              <Button variant="primary" icon={Plus} onClick={openDialog}>
                Request transfer
              </Button>
            ) : null}
          </>
        }
      >
        <DataTable
          caption="Inter-branch transfer requests"
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          empty={
            <EmptyState
              icon={Repeat}
              title="No transfers found"
              message="No transfer requests match the current branch and status filters."
            />
          }
        />
        <Paginator
          page={page}
          total={filtered.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="transfers"
        />
      </Panel>

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Request a stock transfer"
        subtitle="Ask another branch to send stock this way. It lands as Pending for warehouse sign-off."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void submitRequest()}>
              {busy ? "Raising…" : "Raise request"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="trf-part"
              className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
            >
              Part
            </label>
            <select
              id="trf-part"
              value={draftSku}
              onChange={(event) => setDraftSku(event.target.value)}
              className={inputClass}
            >
              {parts.map((part) => (
                <option key={part.sku} value={part.sku}>
                  {part.sku} — {part.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="trf-from"
                className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
              >
                From branch
              </label>
              <select
                id="trf-from"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                className={inputClass}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="trf-to"
                className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
              >
                To branch
              </label>
              <select
                id="trf-to"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                className={inputClass}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="trf-qty"
              className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
            >
              Quantity
            </label>
            <input
              id="trf-qty"
              type="number"
              min={1}
              value={draftQty}
              onChange={(event) => setDraftQty(event.target.value)}
              className={inputClass}
            />
            {availableAtSource !== null ? (
              <p className="text-[11px] text-[#6c757d] mt-1.5">
                On hand at the source branch:{" "}
                <strong className="text-[#1a1d23]" style={MONO}>
                  {num(availableAtSource)}
                </strong>
              </p>
            ) : null}
          </div>

          {formError ? (
            <p className="text-[12px] text-[#dc3545]" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
