import type { BranchStock, MatchSuggestion, MatchSummary } from "./types";

/**
 * Objective 4 — Automated Dead-Stock Matchmaker.
 *
 * Cross-references capital that is sitting idle in one branch ("dead stock",
 * no movement for 90+ days) against branches that are short of the very same
 * part. Where both exist, it proposes an inter-branch transfer so the company
 * fulfils demand from its own stock instead of buying new units from suppliers.
 *
 * A source bin's surplus can only be spent once — the algorithm tracks what is
 * left as it walks the target list, so it never over-promises the same units.
 *
 * Shared verbatim between the Express API and the React client's offline demo
 * mode so the matching rule has a single implementation.
 */

export const DEAD_STOCK_DAYS = 90;

export function buildMatchSuggestions(
  stock: BranchStock[],
  minIdleDays = DEAD_STOCK_DAYS,
): MatchSuggestion[] {
  const bySku = new Map<string, BranchStock[]>();
  for (const record of stock) {
    const list = bySku.get(record.sku);
    if (list) list.push(record);
    else bySku.set(record.sku, [record]);
  }

  const suggestions: MatchSuggestion[] = [];

  for (const [sku, records] of bySku) {
    const sources = records
      .filter((r) => r.onHand > 0 && r.daysSinceMovement >= minIdleDays)
      .map((r) => ({ record: r, remaining: r.onHand }));

    const targets = records
      .filter((r) => r.status !== "In Stock" && r.shortfall > 0)
      .sort((a, b) => b.shortfall - a.shortfall);

    if (sources.length === 0 || targets.length === 0) continue;

    for (const target of targets) {
      const source = sources
        .filter((s) => s.remaining > 0 && s.record.branchId !== target.branchId)
        .sort((a, b) => b.remaining - a.remaining)[0];
      if (!source) continue;

      const suggestedQty = Math.min(source.remaining, target.shortfall);
      if (suggestedQty <= 0) continue;
      source.remaining -= suggestedQty;

      const coverage = suggestedQty / Math.max(target.shortfall, 1);
      const idleRatio = Math.min(source.record.daysSinceMovement, 365) / 365;
      const abcBonus =
        target.part.abcClass === "A" ? 20 : target.part.abcClass === "B" ? 10 : 0;
      const matchScore = Math.round((coverage * 50 + idleRatio * 30 + abcBonus) * 10) / 10;

      suggestions.push({
        sku,
        partName: target.part.name,
        fromBranchId: source.record.branchId,
        toBranchId: target.branchId,
        availableQty: source.record.onHand,
        shortfall: target.shortfall,
        suggestedQty,
        unitCost: target.part.unitCost,
        recoveryValue: suggestedQty * target.part.unitCost,
        daysIdle: source.record.daysSinceMovement,
        matchScore,
      });
    }
  }

  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

export function summariseMatches(matches: MatchSuggestion[]): MatchSummary {
  const capital = matches.reduce((sum, m) => sum + m.recoveryValue, 0);
  return {
    suggestions: matches.length,
    partsMatched: new Set(matches.map((m) => m.sku)).size,
    unitsReallocated: matches.reduce((sum, m) => sum + m.suggestedQty, 0),
    capitalRecovered: capital,
    // Every unit reallocated internally is a unit not bought from a supplier.
    procurementAvoided: capital,
  };
}

/** Stable identity for a suggestion, used to dedupe accept/dismiss decisions. */
export function suggestionKey(suggestion: MatchSuggestion): string {
  return `${suggestion.sku}|${suggestion.fromBranchId}|${suggestion.toBranchId}`;
}
