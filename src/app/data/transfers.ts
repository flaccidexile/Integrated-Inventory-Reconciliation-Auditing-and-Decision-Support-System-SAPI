import type { Transfer, TransferStatus } from "../types";
import { BRANCHES } from "./branches";
import { PARTS } from "./parts";

const AS_OF_MS = new Date("2026-10-11T09:00:00+08:00").getTime();

function isoDaysAgo(days: number): string {
  return new Date(AS_OF_MS - days * 86_400_000).toISOString();
}

const REQUESTERS = [
  "Ana Santos",
  "Carlo Dela Cruz",
  "Jose Garcia",
  "Ramon Villanueva",
  "Mario Santos",
  "Elena Bautista",
  "Ramon Cruz",
];

/** Older transfers are further along the pipeline. */
function statusFor(daysAgo: number, roll: number): TransferStatus {
  if (daysAgo <= 3) return roll < 0.55 ? "Pending" : "Approved";
  if (daysAgo <= 8) return roll < 0.35 ? "Approved" : "In Transit";
  if (daysAgo <= 14) return roll < 0.25 ? "In Transit" : "Completed";
  return roll < 0.08 ? "Rejected" : "Completed";
}

function buildTransfers(): Transfer[] {
  const out: Transfer[] = [];
  const count = 26;

  for (let i = 0; i < count; i++) {
    const part = PARTS[(i * 7 + 3) % PARTS.length];
    const from = BRANCHES[(i * 3) % BRANCHES.length];
    // +4 (mod 8) can never collide with the source branch.
    const to = BRANCHES[(i * 3 + 4) % BRANCHES.length];
    if (!part || !from || !to) continue;

    const daysAgo = Math.round(1 + (i / count) * 44);
    const roll = ((i * 97) % 100) / 100;

    out.push({
      id: `TF-2026-${String(count - i).padStart(3, "0")}`,
      sku: part.sku,
      partName: part.name,
      fromBranchId: from.id,
      toBranchId: to.id,
      qty: 5 + ((i * 13) % 116),
      requestedBy: REQUESTERS[i % REQUESTERS.length] ?? "Unassigned",
      date: isoDaysAgo(daysAgo),
      status: statusFor(daysAgo, roll),
      // Every third transfer originated from the dead-stock matchmaker.
      autoSuggested: i % 3 === 0,
    });
  }

  return out;
}

export const TRANSFERS: Transfer[] = buildTransfers();

export const PENDING_TRANSFERS = TRANSFERS.filter((t) => t.status === "Pending");
export const IN_TRANSIT_TRANSFERS = TRANSFERS.filter((t) => t.status === "In Transit");
export const COMPLETED_TRANSFERS = TRANSFERS.filter((t) => t.status === "Completed");

export const TRANSFERS_MONTHLY = [
  { month: "Feb", transfers: 42, orders: 18 },
  { month: "Mar", transfers: 58, orders: 22 },
  { month: "Apr", transfers: 51, orders: 19 },
  { month: "May", transfers: 67, orders: 25 },
  { month: "Jun", transfers: 73, orders: 28 },
  { month: "Jul", transfers: 89, orders: 31 },
  { month: "Aug", transfers: 94, orders: 34 },
  { month: "Sep", transfers: 102, orders: 38 },
];
