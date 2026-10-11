import type { SupabaseClient } from "@supabase/supabase-js";

import { fromSupabaseError, HttpError } from "../http";
import type {
  CycleSummary,
  DashboardKpis,
  DiscrepancyAnalytics,
  RootCause,
} from "../../../shared/types";

/**
 * Thin wrappers over the RPCs in `0003_analytics.sql`.
 *
 * All three do their aggregation inside Postgres. That keeps the API stateless
 * and means the numbers the dashboard shows are computed from the same rows the
 * charts are, in one transaction — no chance of a total disagreeing with the
 * list underneath it.
 */

interface KpiRow {
  total_positions: number;
  total_units: number;
  total_value: number | string;
  dead_stock_count: number;
  dead_stock_value: number | string;
  low_stock_count: number;
  low_stock_value: number | string;
  out_of_stock_count: number;
  count_accuracy: number | string | null;
  stock_health: number | string | null;
  open_discrepancies: number;
  locked_value: number | string;
  total_variance_cost: number | string;
  resolved_this_month: number;
  pending_transfers: number;
  in_transit_transfers: number;
  open_pos: number;
  po_spend_total: number | string;
  sku_count: number;
  branch_count: number;
}

function num(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchKpis(db: SupabaseClient): Promise<DashboardKpis> {
  const { data, error } = await db.rpc("rpc_dashboard_kpis");
  if (error) throw fromSupabaseError(error);

  const row = (Array.isArray(data) ? data[0] : data) as KpiRow | undefined;
  if (!row) {
    throw new HttpError(500, "kpi_unavailable", "Dashboard KPIs could not be computed.");
  }

  return {
    totalPositions: num(row.total_positions),
    totalUnits: num(row.total_units),
    totalValue: num(row.total_value),
    deadStockCount: num(row.dead_stock_count),
    deadStockValue: num(row.dead_stock_value),
    lowStockCount: num(row.low_stock_count),
    lowStockValue: num(row.low_stock_value),
    outOfStockCount: num(row.out_of_stock_count),
    countAccuracy: num(row.count_accuracy),
    stockHealth: num(row.stock_health),
    openDiscrepancies: num(row.open_discrepancies),
    lockedValue: num(row.locked_value),
    totalVarianceCost: num(row.total_variance_cost),
    resolvedThisMonth: num(row.resolved_this_month),
    pendingTransfers: num(row.pending_transfers),
    inTransitTransfers: num(row.in_transit_transfers),
    openPos: num(row.open_pos),
    poSpendTotal: num(row.po_spend_total),
    skuCount: num(row.sku_count),
    branchCount: num(row.branch_count),
  };
}

/** The shapes the RPC emits — JSONB, so snake_case and possibly string numerics. */
interface ByMonthRow {
  month: string;
  opened: number | string | null;
  resolved: number | string | null;
  backlog: number | string | null;
  cost: number | string | null;
}

interface ByBranchRow {
  branch_id: string;
  short_name: string;
  discrepancies: number | string | null;
  cost: number | string | null;
  accuracy_rate: number | string | null;
}

interface ByCauseRow {
  cause: RootCause;
  count: number | string | null;
  cost: number | string | null;
}

export async function fetchAnalytics(db: SupabaseClient): Promise<DiscrepancyAnalytics> {
  const { data, error } = await db.rpc("rpc_discrepancy_analytics");
  if (error) throw fromSupabaseError(error);

  const payload = (data ?? {}) as {
    byMonth?: ByMonthRow[];
    byBranch?: ByBranchRow[];
    byCause?: ByCauseRow[];
  };

  // Every array is mapped explicitly rather than passed through. The RPC emits
  // snake_case, and returning `byBranch` untouched produced objects with no
  // `accuracyRate` or `shortName` — the analytics screen then threw
  // "Cannot read properties of undefined (reading 'toFixed')" while formatting
  // the missing rate, which blanked the page. `byMonth` and `byCause` happened
  // to survive because their column names are already single words, which is
  // exactly why the mismatch went unnoticed.
  return {
    byMonth: (payload.byMonth ?? []).map((row) => ({
      month: row.month,
      opened: num(row.opened),
      resolved: num(row.resolved),
      backlog: num(row.backlog),
      cost: num(row.cost),
    })),
    byBranch: (payload.byBranch ?? []).map((row) => ({
      branchId: row.branch_id,
      shortName: row.short_name,
      discrepancies: num(row.discrepancies),
      cost: num(row.cost),
      accuracyRate: num(row.accuracy_rate),
    })),
    byCause: (payload.byCause ?? []).map((row) => ({
      cause: row.cause,
      count: num(row.count),
      cost: num(row.cost),
    })),
  };
}

interface CycleSummaryRow {
  total_tasks: number;
  pending: number;
  sheet_printed: number;
  counted: number;
  reconciled: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  completion_rate: number | string | null;
}

export async function fetchCycleSummary(db: SupabaseClient): Promise<CycleSummary> {
  const { data, error } = await db.rpc("rpc_cycle_summary");
  if (error) throw fromSupabaseError(error);

  const row = (Array.isArray(data) ? data[0] : data) as CycleSummaryRow | undefined;
  if (!row) {
    throw new HttpError(500, "cycle_summary_unavailable", "Cycle-count summary could not be computed.");
  }

  return {
    totalTasks: num(row.total_tasks),
    pending: num(row.pending),
    sheetPrinted: num(row.sheet_printed),
    counted: num(row.counted),
    reconciled: num(row.reconciled),
    critical: num(row.critical),
    high: num(row.high),
    medium: num(row.medium),
    low: num(row.low),
    completionRate: num(row.completion_rate),
  };
}
