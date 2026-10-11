import type { AbcClass, BranchStock, CyclePriority, CycleTask, CycleTaskStatus, CycleSummary } from "./types";

/**
 * Objective 1 — Targeted Cycle Counting.
 *
 * The audit engine ranks every bin so warehouse staff only count what is
 * actually at risk, instead of counting the whole floor. The score blends:
 *
 *   1. Staleness      — how long since the bin was physically counted.
 *   2. ABC weighting  — high-value (A) parts are audited more aggressively.
 *   3. Transfer boost — bins touched by a recent transfer are error-prone,
 *                       because quantity is most likely to have drifted then.
 *
 * The resulting list is exported as a printable "blind count" sheet (no system
 * quantities shown) so it can be used on the warehouse floor where mobile
 * phones are prohibited by company policy.
 *
 * This module is shared verbatim between the Express API (which generates the
 * live queue) and the React client (which uses it for offline demo mode), so
 * there is exactly one implementation of the scoring rule.
 */

const ABC_WEIGHT: Record<AbcClass, number> = { A: 1.6, B: 1.2, C: 0.8 };

/** Staleness is capped at 180 days so one long-abandoned bin cannot dominate. */
export const STALENESS_CAP = 180;

export const PRIORITY_THRESHOLDS = {
  critical: 150,
  high: 110,
  medium: 70,
} as const;

/**
 * Staleness contributes 0–100 before weighting, so the maximum attainable
 * score is 230 (a class-A part untouched for 180 days, just after a transfer).
 */
export function cycleScore(input: {
  daysSinceCount: number;
  daysSinceTransfer: number | null;
  abcClass: AbcClass;
}): number {
  const stalenessRatio = Math.min(input.daysSinceCount, STALENESS_CAP) / STALENESS_CAP;
  const staleness = stalenessRatio * 100 * ABC_WEIGHT[input.abcClass];

  let transferBoost = 0;
  const t = input.daysSinceTransfer;
  if (t !== null) {
    if (t <= 7) transferBoost = 70;
    else if (t <= 14) transferBoost = 45;
    else if (t <= 30) transferBoost = 20;
  }

  return Math.round((staleness + transferBoost) * 10) / 10;
}

export function priorityFromScore(score: number): CyclePriority {
  if (score >= PRIORITY_THRESHOLDS.critical) return "Critical";
  if (score >= PRIORITY_THRESHOLDS.high) return "High";
  if (score >= PRIORITY_THRESHOLDS.medium) return "Medium";
  return "Low";
}

export function cycleReason(daysSinceCount: number, daysSinceTransfer: number | null): string {
  const parts: string[] = [];
  if (daysSinceCount >= STALENESS_CAP) parts.push(`not counted in ${daysSinceCount} days`);
  else parts.push(`${daysSinceCount} days since last count`);

  if (daysSinceTransfer !== null && daysSinceTransfer <= 30) {
    parts.push(`transfer activity ${daysSinceTransfer}d ago`);
  }
  return parts.join(" · ");
}

/**
 * Builds the daily audit list. Every branch gets its own top-N sheet so the
 * workload stays realistic for a single shift.
 */
export function buildCycleTasks(
  stock: BranchStock[],
  assignees: string[],
  perBranch = 8,
): CycleTask[] {
  const byBranch = new Map<string, BranchStock[]>();
  for (const record of stock) {
    const list = byBranch.get(record.branchId);
    if (list) list.push(record);
    else byBranch.set(record.branchId, [record]);
  }

  const tasks: CycleTask[] = [];

  for (const [branchId, records] of byBranch) {
    const ranked = records
      .map((record) => ({
        record,
        score: cycleScore({
          daysSinceCount: record.daysSinceCount,
          daysSinceTransfer: record.daysSinceTransfer,
          abcClass: record.part.abcClass,
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perBranch);

    ranked.forEach(({ record, score }, index) => {
      tasks.push({
        id: `CC-${branchId}-${String(index + 1).padStart(3, "0")}`,
        sku: record.sku,
        branchId: record.branchId,
        binLocation: record.binLocation,
        priority: priorityFromScore(score),
        score,
        daysSinceCount: record.daysSinceCount,
        daysSinceTransfer: record.daysSinceTransfer,
        abcClass: record.part.abcClass,
        reason: cycleReason(record.daysSinceCount, record.daysSinceTransfer),
        status: "Pending" as CycleTaskStatus,
        assignedTo: assignees[(index + branchId.length) % assignees.length] ?? "Unassigned",
      });
    });
  }

  return tasks.sort((a, b) => b.score - a.score);
}

export function summariseCycleTasks(tasks: CycleTask[]): CycleSummary {
  const count = (status: CycleTaskStatus) => tasks.filter((t) => t.status === status).length;
  const priority = (p: CyclePriority) => tasks.filter((t) => t.priority === p).length;
  return {
    totalTasks: tasks.length,
    pending: count("Pending"),
    sheetPrinted: count("Sheet Printed"),
    counted: count("Counted"),
    reconciled: count("Reconciled"),
    critical: priority("Critical"),
    high: priority("High"),
    medium: priority("Medium"),
    low: priority("Low"),
    completionRate:
      tasks.length === 0
        ? 0
        : Math.round((1000 * count("Reconciled")) / tasks.length) / 10,
  };
}
