import type { Discrepancy, DiscrepancyByMonth } from "../types";

/**
 * Objective 3 — Discrepancy analytics.
 *
 * Three definitions live here, and getting any of them wrong makes the chart
 * lie about the state of the reconciliation programme:
 *
 *   opened    tickets *raised* during the month.
 *   resolved  tickets *decided* during the month. This is keyed on `reviewedAt`
 *             and NOT on `raisedAt`. The first version keyed it on the raise
 *             date, which counted every already-decided ticket as resolved in
 *             the month it was raised — so "Opened" and "Resolved" came out
 *             nearly identical and the chart showed nothing worth reading.
 *   backlog   tickets raised on or before the month that were still undecided
 *             at the end of it. This is the number that tells management
 *             whether the branch network is keeping up, and it is the reason
 *             the chart is worth looking at at all.
 *
 * Month keys are `YYYY-MM`, so plain string comparison is chronological and no
 * timezone arithmetic is needed.
 *
 * The same three definitions are implemented in SQL by
 * `rpc_discrepancy_analytics` (supabase/migrations/0003_analytics.sql). They
 * are duplicated because one has to run offline; if you change one, change the
 * other.
 */

/** "2026-03" for a timestamp, or "" when it cannot be parsed. */
function monthKey(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "Mar" — the axis label for a `YYYY-MM` key. */
function shortMonth(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function buildByMonth(tickets: Discrepancy[]): DiscrepancyByMonth[] {
  // Every month that saw a ticket raised *or* a decision recorded, so a month
  // in which the team only cleared a backlog still appears on the axis.
  const keys = new Set<string>();
  for (const ticket of tickets) {
    const raised = monthKey(ticket.raisedAt);
    if (raised) keys.add(raised);
    const reviewed = monthKey(ticket.reviewedAt);
    if (reviewed) keys.add(reviewed);
  }

  return [...keys].sort().map((key) => {
    let opened = 0;
    let resolved = 0;
    let backlog = 0;
    let cost = 0;

    for (const ticket of tickets) {
      const raised = monthKey(ticket.raisedAt);
      const reviewed = monthKey(ticket.reviewedAt);

      if (raised === key) {
        opened += 1;
        cost += ticket.varianceValue;
      }
      if (reviewed === key) resolved += 1;

      // Open at the close of this month: raised by now, not yet decided.
      if (raised !== "" && raised <= key && (reviewed === "" || reviewed > key)) {
        backlog += 1;
      }
    }

    return { month: shortMonth(key), opened, resolved, backlog, cost };
  });
}
