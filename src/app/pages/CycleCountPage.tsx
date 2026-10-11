import { useMemo, useState } from "react";
import { ClipboardList, FileCheck2, Info, Loader2, Printer, ScanLine, X } from "lucide-react";
import type { CycleTask } from "../types";
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
import { BlindCountSheet } from "../components/reconciliation/BlindCountSheet";
import { MONO, num, peso } from "../lib/format";
import { useSystemStore } from "../store/SystemStore";
import { STALENESS_CAP } from "../../../shared/cycleCount";

const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"] as const;
type PriorityFilter = (typeof PRIORITIES)[number];

/**
 * Objective 1 — the cycle-count workspace.
 *
 * All state comes from the store: the queue is whatever the server generated,
 * and encoding a count goes through `reconcileCount`, which is the call that
 * decides whether a discrepancy ticket gets raised. The page no longer holds a
 * private copy of the tasks, so two supervisors looking at the same queue see
 * the same thing.
 */
export function CycleCountPage() {
  const {
    cycleTasks: tasks,
    cycleSummary,
    branches,
    stock,
    branchById,
    branchShortName,
    partBySku,
    permissions,
    busy,
    generateCycleQueue,
    setCycleTaskStatus,
    reconcileCount,
  } = useSystemStore();

  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [page, setPage] = useState(1);
  const [sheetBranch, setSheetBranch] = useState<string | null>(null);
  const [countTask, setCountTask] = useState<CycleTask | null>(null);
  const [countedValue, setCountedValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const perPage = 10;

  const overdueBins = useMemo(
    () => tasks.filter((task) => task.daysSinceCount >= STALENESS_CAP).length,
    [tasks],
  );

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (branchFilter === "ALL" || task.branchId === branchFilter) &&
          (priorityFilter === "All" || task.priority === priorityFilter),
      ),
    [tasks, branchFilter, priorityFilter],
  );

  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  const sheetTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.branchId === sheetBranch && task.status !== "Reconciled")
        .sort((a, b) => b.score - a.score),
    [tasks, sheetBranch],
  );

  /** Marks every pending bin for a branch as printed, then shows the sheet. */
  async function generateSheet(branchId: string) {
    setWorking(true);
    setMessage(null);
    try {
      const pending = tasks.filter(
        (task) => task.branchId === branchId && task.status === "Pending",
      );
      for (const task of pending) {
        await setCycleTaskStatus(task.id, "Sheet Printed");
      }
      setSheetBranch(branchId);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not prepare that sheet.");
    } finally {
      setWorking(false);
    }
  }

  const countStock = countTask
    ? stock.find((row) => row.sku === countTask.sku && row.branchId === countTask.branchId)
    : undefined;

  const countedNumber = Number.parseInt(countedValue, 10);
  const hasCount = countedValue.trim() !== "" && !Number.isNaN(countedNumber);
  const variance = countStock && hasCount ? countedNumber - countStock.onHand : 0;

  async function submitCount() {
    if (!countTask || !countStock || !hasCount) return;
    setWorking(true);
    try {
      const result = await reconcileCount(countTask.id, countedNumber);

      if (result.matched) {
        setMessage(
          `${countTask.sku} at ${branchShortName(countTask.branchId)} reconciled with no variance. The bin's count date has been reset.`,
        );
      } else {
        setMessage(
          `${countTask.sku} at ${branchShortName(countTask.branchId)}: variance of ${
            result.variance > 0 ? "+" : ""
          }${result.variance} units. The record is locked and ticket ${
            result.discrepancy?.id ?? ""
          } has been routed to ${branchById(countTask.branchId)?.manager ?? "the branch manager"} for approval.`,
        );
      }

      setCountTask(null);
      setCountedValue("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not record that count.");
    } finally {
      setWorking(false);
    }
  }

  const columns: Column<CycleTask>[] = [
    {
      key: "bin",
      header: "Bin",
      render: (task) => (
        <span className="text-[12px] font-medium text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {task.binLocation}
        </span>
      ),
    },
    {
      key: "part",
      header: "Part",
      render: (task) => (
        <div className="min-w-0 max-w-[260px]">
          <div className="text-[12px] text-blue-600 font-medium" style={MONO}>
            {task.sku}
          </div>
          <div className="text-[13px] text-[#1a1d23] truncate">
            {partBySku(task.sku)?.name ?? task.sku}
          </div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      render: (task) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">
          {branchShortName(task.branchId)}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (task) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <StatusBadge status={task.priority} />
          <span className="text-[11px] text-[#6c757d]" style={MONO}>
            {task.score}
          </span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Why it was selected",
      render: (task) => <span className="text-[12px] text-[#6c757d]">{task.reason}</span>,
      className: "max-w-[220px]",
    },
    {
      key: "assigned",
      header: "Assigned to",
      render: (task) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">{task.assignedTo}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (task) => <StatusBadge status={task.status} />,
    },
    {
      key: "action",
      header: "Action",
      render: (task) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          {permissions.canEncodeCounts ? (
            <Button
              size="sm"
              variant="primary"
              icon={ScanLine}
              disabled={task.status === "Reconciled"}
              onClick={() => {
                setCountTask(task);
                setCountedValue("");
              }}
            >
              Encode count
            </Button>
          ) : (
            <span className="text-[11px] text-[#adb5bd]">View only</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="print:hidden space-y-5">
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded px-4 py-3">
          <Info size={14} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[12px] text-[#0c447c] leading-relaxed">
            <strong>How targeting works.</strong> Every bin is scored on staleness, ABC class and
            recent transfer activity, so staff audit the highest-risk stock first instead of counting
            the whole floor. Sheets are printed blind — no system quantities — to comply with the
            warehouse no-phone policy.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Bins on the list"
            value={num(cycleSummary.totalTasks)}
            sub={`Across ${branches.length} branches`}
            accent="blue"
          />
          <KpiCard
            label="Critical priority"
            value={num(cycleSummary.critical)}
            sub={`${cycleSummary.high} more rated High`}
            trend="up"
            delta="Audit these first"
            accent="red"
          />
          <KpiCard
            label="Overdue bins"
            value={num(overdueBins)}
            sub={`Not counted in ${STALENESS_CAP}+ days`}
            accent="amber"
          />
          <KpiCard
            label="Reconciled"
            value={num(cycleSummary.reconciled)}
            sub={`${cycleSummary.sheetPrinted} sheets printed · ${cycleSummary.counted} counts encoded`}
            accent="green"
          />
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

        <Panel
          title="Targeted cycle count queue"
          subtitle={`${filtered.length} bins prioritised for audit`}
          actions={
            <>
              <label htmlFor="cc-branch" className="sr-only">
                Filter by branch
              </label>
              <select
                id="cc-branch"
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
                label="Filter by priority"
                options={PRIORITIES}
                value={priorityFilter}
                onChange={(value) => {
                  setPriorityFilter(value);
                  setPage(1);
                }}
              />

              {permissions.canGenerateCycleQueue ? (
                <Button
                  icon={busy ? Loader2 : ClipboardList}
                  disabled={busy}
                  onClick={() => void generateCycleQueue()}
                >
                  {busy ? "Working…" : "Regenerate queue"}
                </Button>
              ) : null}

              <Button
                icon={Printer}
                disabled={working}
                onClick={() =>
                  void generateSheet(branchFilter === "ALL" ? branches[0]?.id ?? "" : branchFilter)
                }
              >
                Generate sheet
              </Button>
            </>
          }
        >
          <DataTable
            caption="Cycle count queue ordered by audit priority"
            columns={columns}
            rows={rows}
            rowKey={(task) => task.id}
            empty={
              <EmptyState
                icon={FileCheck2}
                title="Nothing to count"
                message="No bins match the current branch and priority filters. A manager can regenerate the queue."
              />
            }
          />
          <Paginator
            page={page}
            total={filtered.length}
            perPage={perPage}
            onChange={setPage}
            itemLabel="bins"
          />
        </Panel>

        <Panel title="Sheets ready for the floor" subtitle="Print and hand to warehouse staff">
          <div className="p-5 flex flex-wrap gap-2">
            {branches.map((branch) => {
              const count = tasks.filter(
                (task) => task.branchId === branch.id && task.status !== "Reconciled",
              ).length;
              return (
                <Button
                  key={branch.id}
                  icon={ClipboardList}
                  disabled={working}
                  onClick={() => void generateSheet(branch.id)}
                >
                  {branch.shortName} ({count})
                </Button>
              );
            })}
          </div>
        </Panel>
      </div>

      {sheetBranch ? (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 print:hidden">
            <h2 className="text-[14px] font-semibold text-[#1a1d23]">
              Blind count sheet — {branchById(sheetBranch)?.name ?? sheetBranch}
            </h2>
            <div className="flex items-center gap-2">
              <Button icon={Printer} variant="primary" onClick={() => window.print()}>
                Print sheet
              </Button>
              <Button icon={X} onClick={() => setSheetBranch(null)}>
                Close
              </Button>
            </div>
          </div>
          <BlindCountSheet
            branchId={sheetBranch}
            tasks={sheetTasks}
            sheetId={`BC-${sheetBranch}-${String(sheetTasks.length).padStart(2, "0")}`}
          />
        </div>
      ) : null}

      <Modal
        open={countTask !== null}
        onClose={() => setCountTask(null)}
        title="Encode physical count"
        subtitle={
          countTask
            ? `${countTask.binLocation} · ${branchById(countTask.branchId)?.name ?? countTask.branchId}`
            : ""
        }
        footer={
          <>
            <Button onClick={() => setCountTask(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!hasCount || working}
              onClick={() => void submitCount()}
            >
              {working ? "Submitting…" : "Submit count"}
            </Button>
          </>
        }
      >
        {countTask && countStock ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  SKU
                </div>
                <div className="text-[13px] text-blue-600 font-medium" style={MONO}>
                  {countTask.sku}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  Part
                </div>
                <div className="text-[13px] text-[#1a1d23]">{countStock.part.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  System quantity
                </div>
                <div className="text-[13px] text-[#1a1d23] font-medium" style={MONO}>
                  {num(countStock.onHand)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  Unit cost
                </div>
                <div className="text-[13px] text-[#1a1d23]" style={MONO}>
                  {peso(countStock.part.unitCost)}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="counted-qty"
                className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
              >
                Counted quantity
              </label>
              <input
                id="counted-qty"
                type="number"
                min={0}
                inputMode="numeric"
                value={countedValue}
                onChange={(event) => setCountedValue(event.target.value)}
                className="w-full h-9 px-3 text-[13px] text-[#1a1d23] border border-[#dee2e6] rounded bg-[#f8f9fa] outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter the quantity written on the sheet"
              />
            </div>

            {hasCount ? (
              <div
                className={`rounded border px-4 py-3 ${
                  variance === 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6c757d] mb-1">
                  Variance
                </div>
                {variance === 0 ? (
                  <p className="text-[12px] text-[#0f5132]">
                    Count matches the system. The bin will be marked reconciled and its count date
                    reset.
                  </p>
                ) : (
                  <p className="text-[12px] text-[#842029]">
                    <strong style={MONO}>
                      {variance > 0 ? "+" : ""}
                      {num(variance)}
                    </strong>{" "}
                    units ({peso(Math.abs(variance) * countStock.part.unitCost)} at risk). The record
                    will be <strong>locked</strong> and a discrepancy ticket routed to{" "}
                    {branchById(countTask.branchId)?.manager ?? "the branch manager"}.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
