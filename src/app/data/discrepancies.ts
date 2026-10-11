import type { Discrepancy, DiscrepancyStatus, RootCause } from "../types";
import { branchById } from "./branches";
import { STOCK } from "./stock";

/**
 * Objective 2 — Discrepancy Approval Workflow.
 *
 * Every row here is a ticket raised the moment an encoded count disagreed with
 * the system. The record is locked on creation; the physical stock figure is
 * NOT changed until a branch manager investigates and digitally approves the
 * adjustment. Root cause is captured during that review so Objective 3 can
 * report on *why* mismatches happen, not just how many there were.
 */

export const ROOT_CAUSES: RootCause[] = [
  "Miscount",
  "Unrecorded Transfer",
  "Damaged Goods",
  "Misplaced Item",
  "Supplier Short-Ship",
  "Encoding Error",
  "Theft / Shrinkage",
];

const RAISERS = [
  "J. Marteja",
  "K. Catalan",
  "G. Limco",
  "E. Felipe",
  "M. Cruz",
  "L. Aquino",
  "A. Santos",
];

const REVIEWERS = ["M. Reyes", "L. Aquino", "E. Felipe"];

const AS_OF_MS = new Date("2026-10-11T09:00:00+08:00").getTime();

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function isoDaysAgo(days: number): string {
  return new Date(AS_OF_MS - days * 86_400_000).toISOString();
}

function buildDiscrepancies(): Discrepancy[] {
  const rng = makeRng(880417);
  const tickets: Discrepancy[] = [];
  const count = 52;

  for (let i = 0; i < count; i++) {
    // Spread the sample across the whole stock matrix, oldest tickets first.
    const record = STOCK[(i * 37 + 11) % STOCK.length]!;
    const daysAgo = Math.round(2 + (i / count) * 250);

    const magnitude = 0.03 + rng() * 0.34;
    const shortage = rng() < 0.72;
    const rawDelta = Math.max(1, Math.round(Math.max(record.onHand, 6) * magnitude));
    const variance = shortage ? -rawDelta : rawDelta;
    const countedQty = Math.max(0, record.onHand + variance);
    const effectiveVariance = countedQty - record.onHand;

    // Status follows ticket age: fresh tickets are still locked down.
    let status: DiscrepancyStatus;
    if (daysAgo <= 9) status = rng() < 0.7 ? "Locked" : "Under Review";
    else if (daysAgo <= 32) status = rng() < 0.45 ? "Under Review" : rng() < 0.75 ? "Approved" : "Rejected";
    else status = rng() < 0.82 ? "Approved" : "Rejected";

    const resolved = status === "Approved" || status === "Rejected";
    const rootCause: RootCause | null = resolved
      ? ROOT_CAUSES[Math.floor(rng() * ROOT_CAUSES.length)] ?? "Miscount"
      : null;

    tickets.push({
      id: `DSC-2026-${String(count - i).padStart(4, "0")}`,
      sku: record.sku,
      branchId: record.branchId,
      binLocation: record.binLocation,
      systemQty: record.onHand,
      countedQty,
      variance: effectiveVariance,
      unitCost: record.part.unitCost,
      varianceValue: Math.abs(effectiveVariance) * record.part.unitCost,
      rootCause,
      status,
      raisedBy: RAISERS[i % RAISERS.length] ?? "Unassigned",
      raisedAt: isoDaysAgo(daysAgo),
      reviewedBy: resolved ? branchById(record.branchId)?.manager ?? "Manager" : status === "Under Review" ? REVIEWERS[i % REVIEWERS.length] ?? null : null,
      reviewedAt: resolved ? isoDaysAgo(Math.max(1, daysAgo - Math.round(3 + rng() * 12))) : null,
      notes:
        status === "Locked"
          ? "Encoded count disagrees with system quantity. Record locked pending manager review."
          : "",
    });
  }

  return tickets.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

/** All discrepancy tickets, newest first. */
export const DISCREPANCIES: Discrepancy[] = buildDiscrepancies();

export const OPEN_DISCREPANCIES = DISCREPANCIES.filter(
  (d) => d.status === "Locked" || d.status === "Under Review",
);

export const LOCKED_VALUE = OPEN_DISCREPANCIES.reduce((sum, d) => sum + d.varianceValue, 0);

export const TOTAL_VARIANCE_COST = DISCREPANCIES.reduce((sum, d) => sum + d.varianceValue, 0);

export function discrepancyById(id: string): Discrepancy | undefined {
  return DISCREPANCIES.find((d) => d.id === id);
}
