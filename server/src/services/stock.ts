import type { SupabaseClient } from "@supabase/supabase-js";

import { fromSupabaseError } from "../http";
import { STOCK_ENRICHED_COLUMNS, asRows, toBranchStock, type StockEnrichedRow } from "../db/types";
import type { BranchStock } from "../../../shared/types";

/**
 * Loads stock positions through the `v_stock_enriched` view, which already
 * carries the derived fields (status, shortfall, value, is_dead_stock) computed
 * by Postgres. Both the cycle-count engine and the matchmaker consume the
 * result, so the two objectives always reason over an identical snapshot.
 *
 * The seeded dataset is 232 positions — comfortably under PostgREST's 1000-row
 * response cap, so no paging is required.
 */
export async function fetchStock(db: SupabaseClient, branchId?: string): Promise<BranchStock[]> {
  let query = db
    .from("v_stock_enriched")
    .select(STOCK_ENRICHED_COLUMNS)
    .order("branch_id", { ascending: true })
    .order("sku", { ascending: true });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw fromSupabaseError(error);

  return asRows<StockEnrichedRow>(data).map(toBranchStock);
}

/** "Julian Marteja" -> "J. Marteja", the form used on the printed sheets. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] ?? fullName;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return `${first.charAt(0)}. ${last}`;
}

/**
 * Names eligible to be assigned a blind-count sheet: the warehouse staff.
 * Falls back to a generic label when no warehouse account exists yet, so
 * generating a queue never fails outright on a fresh install.
 */
export async function fetchAssignees(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("profiles")
    .select("full_name")
    .eq("role", "warehouse")
    .eq("status", "Active")
    .order("full_name", { ascending: true });

  if (error) throw fromSupabaseError(error);

  const names = asRows<{ full_name: string }>(data).map((row) => shortName(row.full_name));
  return names.length > 0 ? names : ["Unassigned"];
}
