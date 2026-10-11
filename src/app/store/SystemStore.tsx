import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { buildDemoSnapshot, demoCompany, deriveAll, type DemoCollections } from "./demoData";
import type { BootstrapResponse, SystemSnapshot } from "./snapshot";
import { suggestionKey } from "../../../shared/matchmaker";
import { permissionsFor, type Permissions } from "../../../shared/permissions";
import type {
  Branch,
  BranchStock,
  CompanyInfo,
  CycleSummary,
  CycleTask,
  CycleTaskStatus,
  DashboardKpis,
  Discrepancy,
  DiscrepancyAnalytics,
  MatchSuggestion,
  MatchSummary,
  Part,
  PurchaseOrder,
  RootCause,
  SessionProfile,
  Supplier,
  Transfer,
  TransferStatus,
} from "../../../shared/types";

/**
 * The application's data store.
 *
 * In API mode it hydrates from `GET /api/bootstrap` and every mutation is a
 * round trip followed by a refresh. Re-reading the whole snapshot after a write
 * is a deliberate choice: the KPIs, the analytics roll-ups and the matchmaker
 * suggestions are all derived server-side, so refetching guarantees the derived
 * figures agree with the rows they came from. At 232 stock positions the
 * payload is small enough that this costs nothing perceptible.
 *
 * In demo mode the same shape is served from the bundled dataset and mutations
 * are applied locally, with the derived figures recomputed in-process.
 */

export type StoreStatus = "loading" | "ready" | "error";

export interface ReconcileResult {
  systemQty: number;
  countedQty: number;
  variance: number;
  matched: boolean;
  discrepancy: Discrepancy | null;
}

export interface SystemStoreValue {
  status: StoreStatus;
  mode: "api" | "demo";
  error: string | null;
  /** True while a mutation is in flight. */
  busy: boolean;
  refresh: () => Promise<void>;

  /* Data */
  company: CompanyInfo;
  branches: Branch[];
  parts: Part[];
  suppliers: Supplier[];
  stock: BranchStock[];
  cycleTasks: CycleTask[];
  discrepancies: Discrepancy[];
  openDiscrepancies: Discrepancy[];
  transfers: Transfer[];
  purchaseOrders: PurchaseOrder[];
  /** The staff directory from `profiles` — used by the Settings screen. */
  staff: SessionProfile[];
  suggestions: MatchSuggestion[];
  matchSummary: MatchSummary;
  cycleSummary: CycleSummary;
  kpis: DashboardKpis;
  analytics: DiscrepancyAnalytics;
  asOf: string;

  /* Lookups */
  branchById: (id: string) => Branch | undefined;
  branchName: (id: string) => string;
  branchShortName: (id: string) => string;
  partBySku: (sku: string) => Part | undefined;
  partName: (sku: string) => string;

  /* Derived slices the pages filter on */
  deadStock: BranchStock[];
  lowStock: BranchStock[];
  outOfStock: BranchStock[];
  stockForBranch: (branchId: string) => BranchStock[];

  /* Permissions, mirrored from the session */
  permissions: Permissions;

  /* Actions */
  generateCycleQueue: (options?: { perBranch?: number }) => Promise<void>;
  setCycleTaskStatus: (id: string, status: CycleTaskStatus) => Promise<void>;
  reconcileCount: (taskId: string, countedQty: number, notes?: string) => Promise<ReconcileResult>;
  raiseDiscrepancy: (input: {
    sku: string;
    branchId: string;
    countedQty: number;
    notes?: string;
  }) => Promise<void>;
  reviewDiscrepancy: (
    id: string,
    decision: "Approved" | "Rejected",
    rootCause: RootCause | null,
    notes: string,
  ) => Promise<void>;
  acceptSuggestion: (suggestion: MatchSuggestion) => Promise<void>;
  dismissSuggestion: (suggestion: MatchSuggestion) => Promise<void>;
  requestTransfer: (input: {
    sku: string;
    fromBranchId: string;
    toBranchId: string;
    qty: number;
  }) => Promise<void>;
  setTransferStatus: (id: string, status: TransferStatus) => Promise<void>;
  setPurchaseOrderStatus: (id: string, status: PurchaseOrder["status"]) => Promise<void>;
}

const SystemStoreContext = createContext<SystemStoreValue | null>(null);

export { suggestionKey };

/* ── Demo-mode helpers ─────────────────────────────────────────────────── */

function nextId(prefix: string, existing: string[], width: number): string {
  let highest = 0;
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue;
    const digits = id.slice(prefix.length).replace(/\D/g, "");
    const parsed = Number.parseInt(digits, 10);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return `${prefix}${String(highest + 1).padStart(width, "0")}`;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${(parts[0] ?? "").charAt(0)}. ${parts[parts.length - 1] ?? ""}`;
}

/** Recomputes every derived figure after a demo-mode mutation. */
function withDerived(
  snapshot: SystemSnapshot,
  collections: DemoCollections,
  parts: Part[],
  branches: Branch[],
): SystemSnapshot {
  return { ...snapshot, ...collections, ...deriveAll(collections, parts, branches) };
}

export function SystemStoreProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    permissions: sessionPermissions,
    status: authStatus,
    mode,
    signOut,
  } = useAuth();

  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(() =>
    mode === "demo" ? buildDemoSnapshot() : null,
  );
  const [status, setStatus] = useState<StoreStatus>(mode === "demo" ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const canLoad = mode === "demo" || authStatus === "signed-in";

  /**
   * An expired or revoked session is not a data problem, so it is not reported
   * as one. Signing out returns the user to the login screen, which is the only
   * thing that can actually fix it — showing them "Missing bearer token. Sign
   * in and send `Authorization: Bearer <access_token>`" would leak an internal
   * API message and offer no way forward.
   *
   * Returns true when the failure was handled here.
   */
  const handleAuthFailure = useCallback(
    (caught: unknown): boolean => {
      if (!(caught instanceof ApiError) || !caught.isAuthError) return false;
      setSnapshot(null);
      setError(null);
      setStatus("loading");
      void signOut();
      return true;
    },
    [signOut],
  );

  /* ── Load ────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    if (mode === "demo") {
      setSnapshot(buildDemoSnapshot());
      setStatus("ready");
      return;
    }
    try {
      const payload = await api.get<BootstrapResponse>("/bootstrap");
      setSnapshot({
        company: payload.company ?? demoCompany(),
        branches: payload.branches,
        parts: payload.parts,
        suppliers: payload.suppliers,
        stock: payload.stock,
        cycleTasks: payload.cycleTasks,
        discrepancies: payload.discrepancies,
        transfers: payload.transfers,
        purchaseOrders: payload.purchaseOrders,
        staff: payload.staff,
        suggestions: payload.matchmaker.suggestions,
        matchSummary: payload.matchmaker.summary,
        cycleSummary: payload.cycleSummary,
        kpis: payload.kpis,
        analytics: payload.analytics,
        asOf: payload.asOf,
      });
      setError(null);
      setStatus("ready");
    } catch (caught) {
      if (handleAuthFailure(caught)) return;

      // Deliberately *not* falling back to the bundled dataset here. Demo mode
      // is an explicit mode chosen when Supabase is not configured; silently
      // substituting it after a failed request would show a signed-in user a
      // complete, plausible and entirely fabricated set of inventory figures
      // with no indication anything was wrong. Surfacing the error is the only
      // honest option for a reconciliation system.
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error("Could not load data from the API:", caught);
      setSnapshot(null);
      setError(message);
      setStatus("error");
    }
  }, [mode, handleAuthFailure]);

  useEffect(() => {
    if (!canLoad) {
      if (authStatus === "signed-out") {
        setSnapshot(null);
        setStatus("loading");
      }
      return;
    }
    void refresh();
  }, [canLoad, authStatus, refresh]);

  /* ── Mutation plumbing ───────────────────────────────────────────────── */

  /**
   * Runs a mutation and keeps the store consistent.
   *
   * In API mode the write happens on the server and the snapshot is re-read, so
   * server-derived figures stay authoritative. In demo mode the local updater
   * is applied and the derived figures are recomputed from the result.
   *
   * A failed API mutation is propagated to the caller rather than being
   * replayed locally. Applying the change in the browser instead would show the
   * ticket as approved while the database still held it open — the user would
   * believe a decision had been recorded when it had not.
   */
  const run = useCallback(
    async (
      apiCall: (() => Promise<unknown>) | null,
      localUpdate: ((current: SystemSnapshot) => DemoCollections) | null,
    ): Promise<void> => {
      setPending((n) => n + 1);
      try {
        if (mode === "api") {
          if (apiCall) await apiCall();
          await refresh();
        } else if (localUpdate) {
          setSnapshot((current) => {
            if (!current) return current;
            const next = localUpdate(current);
            return withDerived(current, next, current.parts, current.branches);
          });
        }
      } catch (caught) {
        if (handleAuthFailure(caught)) return;
        throw caught;
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [mode, refresh, handleAuthFailure],
  );

  const collectionsOf = (s: SystemSnapshot): DemoCollections => ({
    stock: s.stock,
    cycleTasks: s.cycleTasks,
    discrepancies: s.discrepancies,
    transfers: s.transfers,
    purchaseOrders: s.purchaseOrders,
    suggestions: s.suggestions,
  });

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const generateCycleQueue = useCallback(
    async (options?: { perBranch?: number }) => {
      await run(
        () => api.post("/cycle-tasks/generate", options ?? {}),
        // Demo mode already holds the full ranked queue, so regeneration is a
        // no-op beyond confirming the figures.
        (current) => collectionsOf(current),
      );
    },
    [run],
  );

  const setCycleTaskStatus = useCallback(
    async (id: string, next: CycleTaskStatus) => {
      await run(
        () => api.patch(`/cycle-tasks/${encodeURIComponent(id)}`, { status: next }),
        (current) => ({
          ...collectionsOf(current),
          cycleTasks: current.cycleTasks.map((task) =>
            task.id === id ? { ...task, status: next } : task,
          ),
        }),
      );
    },
    [run],
  );

  const reconcileCount = useCallback(
    async (taskId: string, countedQty: number, notes?: string): Promise<ReconcileResult> => {
      const task = snapshot?.cycleTasks.find((t) => t.id === taskId);
      const position = task
        ? snapshot?.stock.find((row) => row.sku === task.sku && row.branchId === task.branchId)
        : undefined;
      const systemQty = position?.onHand ?? 0;
      const variance = countedQty - systemQty;

      if (mode === "api") {
        // Propagated, not caught: simulating the reconcile locally after a
        // failed write would report a variance and possibly a raised ticket
        // that the database never saw.
        const result = await api.post<ReconcileResult>(
          `/cycle-tasks/${encodeURIComponent(taskId)}/reconcile`,
          { countedQty, notes },
        );
        await refresh();
        return result;
      }

      // Demo mode: reproduce the server's behaviour locally.
      let raised: Discrepancy | null = null;

      await run(null, (current) => {
        const collections = collectionsOf(current);
        const now = new Date().toISOString();

        if (variance !== 0 && task && position) {
          raised = {
            id: nextId("DSC-2026-", collections.discrepancies.map((d) => d.id), 4),
            sku: task.sku,
            branchId: task.branchId,
            binLocation: task.binLocation,
            systemQty,
            countedQty,
            variance,
            unitCost: position.part.unitCost,
            varianceValue: Math.abs(variance) * position.part.unitCost,
            rootCause: null,
            status: "Locked",
            raisedBy: shortName(profile?.fullName ?? "Warehouse Staff"),
            raisedAt: now,
            reviewedBy: null,
            reviewedAt: null,
            notes:
              notes?.trim() ||
              "Encoded count disagrees with the system quantity. Record locked pending manager review.",
          };
        }

        return {
          ...collections,
          discrepancies: raised ? [raised, ...collections.discrepancies] : collections.discrepancies,
          cycleTasks: collections.cycleTasks.map((t) =>
            t.id === taskId ? { ...t, status: "Reconciled" as CycleTaskStatus } : t,
          ),
        };
      });

      return {
        systemQty,
        countedQty,
        variance,
        matched: variance === 0,
        discrepancy: raised,
      };
    },
    [mode, refresh, run, snapshot, profile],
  );

  const raiseDiscrepancy = useCallback(
    async (input: { sku: string; branchId: string; countedQty: number; notes?: string }) => {
      await run(
        () => api.post("/discrepancies", input),
        (current) => {
          const collections = collectionsOf(current);
          const position = current.stock.find(
            (row) => row.sku === input.sku && row.branchId === input.branchId,
          );
          if (!position) return collections;

          const variance = input.countedQty - position.onHand;
          const ticket: Discrepancy = {
            id: nextId("DSC-2026-", collections.discrepancies.map((d) => d.id), 4),
            sku: input.sku,
            branchId: input.branchId,
            binLocation: position.binLocation,
            systemQty: position.onHand,
            countedQty: input.countedQty,
            variance,
            unitCost: position.part.unitCost,
            varianceValue: Math.abs(variance) * position.part.unitCost,
            rootCause: null,
            status: "Locked",
            raisedBy: shortName(profile?.fullName ?? "Warehouse Staff"),
            raisedAt: new Date().toISOString(),
            reviewedBy: null,
            reviewedAt: null,
            notes: input.notes?.trim() || "Raised manually from the discrepancies register.",
          };
          return { ...collections, discrepancies: [ticket, ...collections.discrepancies] };
        },
      );
    },
    [run, profile],
  );

  const reviewDiscrepancy = useCallback(
    async (
      id: string,
      decision: "Approved" | "Rejected",
      rootCause: RootCause | null,
      notes: string,
    ) => {
      await run(
        () => api.post(`/discrepancies/${encodeURIComponent(id)}/review`, { decision, rootCause, notes }),
        (current) => {
          const collections = collectionsOf(current);
          const ticket = collections.discrepancies.find((d) => d.id === id);
          if (!ticket) return collections;

          const now = new Date().toISOString();
          const reviewer = shortName(profile?.fullName ?? "Management");

          return {
            ...collections,
            discrepancies: collections.discrepancies.map((d) =>
              d.id === id
                ? {
                    ...d,
                    status: decision,
                    rootCause: decision === "Approved" ? rootCause : null,
                    notes: notes.trim() || d.notes,
                    reviewedBy: reviewer,
                    reviewedAt: now,
                  }
                : d,
            ),
            // Approving corrects the physical figure; rejecting leaves it alone.
            stock: collections.stock.map((row) =>
              decision === "Approved" && row.sku === ticket.sku && row.branchId === ticket.branchId
                ? { ...row, onHand: ticket.countedQty }
                : row,
            ),
          };
        },
      );
    },
    [run, profile],
  );

  const acceptSuggestion = useCallback(
    async (suggestion: MatchSuggestion) => {
      await run(
        () =>
          api.post("/matchmaker/accept", {
            sku: suggestion.sku,
            fromBranchId: suggestion.fromBranchId,
            toBranchId: suggestion.toBranchId,
            qty: suggestion.suggestedQty,
          }),
        (current) => {
          const collections = collectionsOf(current);
          const key = suggestionKey(suggestion);
          const transfer: Transfer = {
            id: nextId("TF-2026-", collections.transfers.map((t) => t.id), 3),
            sku: suggestion.sku,
            partName: suggestion.partName,
            fromBranchId: suggestion.fromBranchId,
            toBranchId: suggestion.toBranchId,
            qty: suggestion.suggestedQty,
            requestedBy: profile?.fullName ?? "Dead-Stock Matchmaker",
            date: new Date().toISOString(),
            status: "Pending",
            autoSuggested: true,
          };
          return {
            ...collections,
            transfers: [transfer, ...collections.transfers],
            suggestions: collections.suggestions.filter((s) => suggestionKey(s) !== key),
          };
        },
      );
    },
    [run, profile],
  );

  const dismissSuggestion = useCallback(
    async (suggestion: MatchSuggestion) => {
      await run(
        () =>
          api.post("/matchmaker/dismiss", {
            sku: suggestion.sku,
            fromBranchId: suggestion.fromBranchId,
            toBranchId: suggestion.toBranchId,
          }),
        (current) => {
          const collections = collectionsOf(current);
          const key = suggestionKey(suggestion);
          return {
            ...collections,
            suggestions: collections.suggestions.filter((s) => suggestionKey(s) !== key),
          };
        },
      );
    },
    [run],
  );

  const requestTransfer = useCallback(
    async (input: { sku: string; fromBranchId: string; toBranchId: string; qty: number }) => {
      await run(
        () => api.post("/transfers", input),
        (current) => {
          const collections = collectionsOf(current);
          const part = current.parts.find((p) => p.sku === input.sku);
          const transfer: Transfer = {
            id: nextId("TF-2026-", collections.transfers.map((t) => t.id), 3),
            sku: input.sku,
            partName: part?.name ?? input.sku,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
            qty: input.qty,
            requestedBy: profile?.fullName ?? "Sales Staff",
            date: new Date().toISOString(),
            status: "Pending",
            autoSuggested: false,
          };
          return { ...collections, transfers: [transfer, ...collections.transfers] };
        },
      );
    },
    [run, profile],
  );

  const setTransferStatus = useCallback(
    async (id: string, next: TransferStatus) => {
      await run(
        () => api.patch(`/transfers/${encodeURIComponent(id)}`, { status: next }),
        (current) => ({
          ...collectionsOf(current),
          transfers: current.transfers.map((t) => (t.id === id ? { ...t, status: next } : t)),
        }),
      );
    },
    [run],
  );

  const setPurchaseOrderStatus = useCallback(
    async (id: string, next: PurchaseOrder["status"]) => {
      await run(
        () => api.patch(`/purchase-orders/${encodeURIComponent(id)}`, { status: next }),
        (current) => ({
          ...collectionsOf(current),
          purchaseOrders: current.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: next } : po,
          ),
        }),
      );
    },
    [run],
  );

  /* ── Lookups ─────────────────────────────────────────────────────────── */

  const branchIndex = useMemo(
    () => new Map((snapshot?.branches ?? []).map((b) => [b.id, b])),
    [snapshot?.branches],
  );
  const partIndex = useMemo(
    () => new Map((snapshot?.parts ?? []).map((p) => [p.sku, p])),
    [snapshot?.parts],
  );

  const value = useMemo<SystemStoreValue | null>(() => {
    if (!snapshot) return null;

    const branchById = (id: string) => branchIndex.get(id);
    const partBySku = (sku: string) => partIndex.get(sku);

    return {
      status,
      mode,
      error,
      busy: pending > 0,
      refresh,

      company: snapshot.company,
      branches: snapshot.branches,
      parts: snapshot.parts,
      suppliers: snapshot.suppliers,
      stock: snapshot.stock,
      cycleTasks: snapshot.cycleTasks,
      discrepancies: snapshot.discrepancies,
      openDiscrepancies: snapshot.discrepancies.filter(
        (d) => d.status === "Locked" || d.status === "Under Review",
      ),
      transfers: snapshot.transfers,
      purchaseOrders: snapshot.purchaseOrders,
      staff: snapshot.staff,
      suggestions: snapshot.suggestions,
      matchSummary: snapshot.matchSummary,
      cycleSummary: snapshot.cycleSummary,
      kpis: snapshot.kpis,
      analytics: snapshot.analytics,
      asOf: snapshot.asOf,

      branchById,
      branchName: (id) => branchById(id)?.name ?? id,
      branchShortName: (id) => branchById(id)?.shortName ?? id,
      partBySku,
      partName: (sku) => partBySku(sku)?.name ?? sku,

      deadStock: snapshot.stock.filter((row) => row.isDeadStock),
      lowStock: snapshot.stock.filter((row) => row.status === "Low Stock"),
      outOfStock: snapshot.stock.filter((row) => row.status === "Out of Stock"),
      stockForBranch: (branchId) => snapshot.stock.filter((row) => row.branchId === branchId),

      // The session's matrix is authoritative when signed in; in demo mode it
      // falls back to the demo profile's role.
      permissions: profile ? permissionsFor(profile.role) : sessionPermissions,

      generateCycleQueue,
      setCycleTaskStatus,
      reconcileCount,
      raiseDiscrepancy,
      reviewDiscrepancy,
      acceptSuggestion,
      dismissSuggestion,
      requestTransfer,
      setTransferStatus,
      setPurchaseOrderStatus,
    };
  }, [
    snapshot,
    status,
    mode,
    error,
    pending,
    refresh,
    branchIndex,
    partIndex,
    profile,
    sessionPermissions,
    generateCycleQueue,
    setCycleTaskStatus,
    reconcileCount,
    raiseDiscrepancy,
    reviewDiscrepancy,
    acceptSuggestion,
    dismissSuggestion,
    requestTransfer,
    setTransferStatus,
    setPurchaseOrderStatus,
  ]);

  if (!value) {
    return <StoreLoading status={status} error={error} onRetry={refresh} />;
  }

  return <SystemStoreContext.Provider value={value}>{children}</SystemStoreContext.Provider>;
}

/** Shown while the first bootstrap request is in flight, or if it failed. */
function StoreLoading({
  status,
  error,
  onRetry,
}: {
  status: StoreStatus;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-[#f0f2f5]" role="status" aria-live="polite">
      <div className="text-center max-w-sm">
        {status === "error" ? (
          <>
            <p className="text-[13px] font-medium text-[#dc3545] mb-1">Could not load system data</p>
            <p className="text-[12px] text-[#6c757d] mb-3">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 rounded bg-[#0d6efd] text-white text-[12px] hover:bg-[#0b5ed7]"
            >
              Try again
            </button>
          </>
        ) : (
          <span className="text-[12px] text-[#6c757d]">Loading inventory data…</span>
        )}
      </div>
    </div>
  );
}

export function useSystemStore(): SystemStoreValue {
  const context = useContext(SystemStoreContext);
  if (!context) {
    throw new Error("useSystemStore must be used inside a SystemStoreProvider");
  }
  return context;
}
