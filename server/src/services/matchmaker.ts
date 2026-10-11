import type { SupabaseClient } from "@supabase/supabase-js";

import { fromSupabaseError } from "../http";
import { buildMatchSuggestions, summariseMatches } from "../../../shared/matchmaker";
import type { MatchSuggestion, MatchSummary } from "../../../shared/types";
import { fetchStock } from "./stock";

/**
 * Objective 4 — the dead-stock matchmaker, wired to live data.
 *
 * `buildMatchSuggestions` is the shared engine. What this service adds is the
 * decision memory: a suggestion disappears once somebody has acted on it,
 * either by accepting it (which creates a transfer) or by dismissing it. That
 * suppression lives in the database rather than in browser state, so a
 * supervisor who dismisses an idea does not have to re-dismiss it on the next
 * device they sign in from.
 */

/** Transfers in these states mean the reallocation is already in motion. */
const LIVE_TRANSFER_STATES = ["Pending", "Approved", "In Transit"];

export function pairKey(sku: string, fromBranchId: string, toBranchId: string): string {
  return `${sku}|${fromBranchId}|${toBranchId}`;
}

export interface MatchmakerResult {
  suggestions: MatchSuggestion[];
  summary: MatchSummary;
}

export async function computeSuggestions(
  db: SupabaseClient,
  minIdleDays = 90,
): Promise<MatchmakerResult> {
  const [stock, decided] = await Promise.all([fetchStock(db), fetchDecidedPairs(db)]);

  const suggestions = buildMatchSuggestions(stock, minIdleDays).filter(
    (s) => !decided.has(pairKey(s.sku, s.fromBranchId, s.toBranchId)),
  );

  return { suggestions, summary: summariseMatches(suggestions) };
}

/** Every (sku, source, target) triple that already has a live transfer or a dismissal. */
async function fetchDecidedPairs(db: SupabaseClient): Promise<Set<string>> {
  const [transfers, dismissals] = await Promise.all([
    db
      .from("transfers")
      .select("sku, from_branch_id, to_branch_id")
      .in("status", LIVE_TRANSFER_STATES),
    db
      .from("match_suggestion_dismissals")
      .select("sku, from_branch_id, to_branch_id"),
  ]);

  if (transfers.error) throw fromSupabaseError(transfers.error);
  if (dismissals.error) throw fromSupabaseError(dismissals.error);

  const decided = new Set<string>();
  for (const row of (transfers.data ?? []) as {
    sku: string;
    from_branch_id: string;
    to_branch_id: string;
  }[]) {
    decided.add(pairKey(row.sku, row.from_branch_id, row.to_branch_id));
  }
  for (const row of (dismissals.data ?? []) as {
    sku: string;
    from_branch_id: string;
    to_branch_id: string;
  }[]) {
    decided.add(pairKey(row.sku, row.from_branch_id, row.to_branch_id));
  }
  return decided;
}
