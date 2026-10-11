import type { BranchStock, PartCategory, StockRecord, StockStatus } from "../types";
import { BRANCHES } from "./branches";
import { PARTS } from "./parts";

/**
 * Deterministic generator for the branch × part stock matrix.
 *
 * A fixed-seed LCG is used so the demo dataset is identical on every reload —
 * important for a system whose whole purpose is auditability. A small set of
 * explicit overrides guarantees realistic dead-stock / low-stock pairings so
 * the matchmaker and discrepancy workflows always have meaningful cases.
 */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Relative inventory holding per branch — QC Main is the distribution hub. */
const BRANCH_WEIGHT: Record<string, number> = {
  "BR-QC": 3.2,
  "BR-CB": 2.1,
  "BR-IL": 1.5,
  "BR-BW": 1.3,
  "BR-NZ": 1.0,
  "BR-CDO": 0.95,
  "BR-LG": 0.85,
  "BR-DP": 0.7,
};

const AISLE: Record<PartCategory, string> = {
  "Engine Parts": "A",
  Brakes: "B",
  Electrical: "C",
  Suspension: "D",
  Filters: "E",
  Exhaust: "F",
  Drivetrain: "G",
  "Body Parts": "H",
};

type Override = Partial<Pick<StockRecord, "onHand" | "daysSinceMovement" | "daysSinceCount" | "daysSinceTransfer">>;

const OVERRIDES: Record<string, Override> = {
  // Idle capital sitting in one branch…
  "BRK-47291-A|BR-QC": { onHand: 180, daysSinceMovement: 168, daysSinceCount: 212, daysSinceTransfer: 4 },
  "RAD-50129-A|BR-QC": { onHand: 42, daysSinceMovement: 205, daysSinceCount: 188 },
  "EXH-72841-F|BR-QC": { onHand: 26, daysSinceMovement: 141, daysSinceCount: 96 },
  "SUS-71023-A|BR-QC": { onHand: 95, daysSinceMovement: 190, daysSinceCount: 173 },
  "ELE-19034-B|BR-CB": { onHand: 64, daysSinceMovement: 133, daysSinceCount: 121 },
  "FLT-66102-B|BR-CB": { onHand: 520, daysSinceMovement: 118, daysSinceCount: 143 },
  "STA-61004-A|BR-IL": { onHand: 58, daysSinceMovement: 176, daysSinceCount: 165 },
  "DRV-66430-C|BR-BW": { onHand: 44, daysSinceMovement: 152, daysSinceCount: 134 },
  "BDY-55201-B|BR-NZ": { onHand: 33, daysSinceMovement: 210, daysSinceCount: 199 },
  "ENG-84520-C|BR-DP": { onHand: 61, daysSinceMovement: 163, daysSinceCount: 151 },

  // …matched against a shortage of the very same part elsewhere.
  "RAD-50129-A|BR-CB": { onHand: 4, daysSinceMovement: 6, daysSinceCount: 18, daysSinceTransfer: 9 },
  "EXH-72841-F|BR-IL": { onHand: 2, daysSinceMovement: 11, daysSinceCount: 27 },
  "SUS-71023-A|BR-DP": { onHand: 3, daysSinceMovement: 8, daysSinceCount: 33, daysSinceTransfer: 5 },
  "ELE-19034-B|BR-BW": { onHand: 6, daysSinceMovement: 4, daysSinceCount: 21 },
  "FLT-66102-B|BR-LG": { onHand: 12, daysSinceMovement: 9, daysSinceCount: 44, daysSinceTransfer: 12 },
  "STA-61004-A|BR-CDO": { onHand: 5, daysSinceMovement: 7, daysSinceCount: 30 },
  "BRK-47291-A|BR-NZ": { onHand: 9, daysSinceMovement: 5, daysSinceCount: 16, daysSinceTransfer: 3 },
  "ENG-84520-C|BR-CB": { onHand: 0, daysSinceMovement: 3, daysSinceCount: 25 },
  "BDY-55201-B|BR-LG": { onHand: 1, daysSinceMovement: 14, daysSinceCount: 39 },
  "DRV-66430-C|BR-IL": { onHand: 4, daysSinceMovement: 10, daysSinceCount: 29, daysSinceTransfer: 7 },

  // Genuine stock-outs — demand exists but the shelf is empty.
  "TRS-88812-E|BR-DP": { onHand: 0, daysSinceMovement: 2, daysSinceCount: 19 },
  "BDY-10288-A|BR-LG": { onHand: 0, daysSinceMovement: 5, daysSinceCount: 24, daysSinceTransfer: 8 },
  "SUS-88410-B|BR-CDO": { onHand: 0, daysSinceMovement: 3, daysSinceCount: 31 },
  "FLT-90557-A|BR-NZ": { onHand: 0, daysSinceMovement: 6, daysSinceCount: 27 },
};

export function stockStatus(onHand: number, reorderPoint: number): StockStatus {
  if (onHand <= 0) return "Out of Stock";
  if (onHand < reorderPoint) return "Low Stock";
  return "In Stock";
}

function buildStock(): BranchStock[] {
  const rng = makeRng(20261011);
  const out: BranchStock[] = [];

  BRANCHES.forEach((branch, bi) => {
    PARTS.forEach((part, pi) => {
      const weight = BRANCH_WEIGHT[branch.id] ?? 1;
      const base = part.reorderPoint * weight * (0.55 + rng() * 2.0);

      const moveSpan = part.abcClass === "A" ? 75 : part.abcClass === "B" ? 155 : 300;

      const generated: StockRecord = {
        sku: part.sku,
        branchId: branch.id,
        onHand: Math.max(0, Math.round(base)),
        binLocation: `${AISLE[part.category]}-${String(1 + ((pi * 3 + bi) % 12)).padStart(2, "0")}-${String(1 + ((pi + bi) % 4)).padStart(2, "0")}`,
        daysSinceMovement: Math.round(rng() * moveSpan),
        daysSinceCount: Math.round(5 + rng() * 205),
        daysSinceTransfer: rng() < 0.62 ? null : Math.round(1 + rng() * 28),
      };

      const override = OVERRIDES[`${part.sku}|${branch.id}`];
      const record: StockRecord = { ...generated, ...override };

      const shortfall = Math.max(0, part.reorderPoint - record.onHand);

      out.push({
        ...record,
        part,
        branch,
        status: stockStatus(record.onHand, part.reorderPoint),
        shortfall,
        value: record.onHand * part.unitCost,
        isDeadStock: record.daysSinceMovement >= 90 && record.onHand > 0,
      });
    });
  });

  return out;
}

/** The full stock matrix — 8 branches × 29 parts = 232 positions. */
export const STOCK: BranchStock[] = buildStock();

export const DEAD_STOCK_DAYS = 90;

export const DEAD_STOCK = STOCK.filter((r) => r.isDeadStock).sort(
  (a, b) => b.daysSinceMovement - a.daysSinceMovement,
);

export const LOW_STOCK = STOCK.filter((r) => r.status === "Low Stock");
export const OUT_OF_STOCK = STOCK.filter((r) => r.status === "Out of Stock");

export const TOTAL_POSITIONS = STOCK.length;
export const TOTAL_UNITS = STOCK.reduce((sum, r) => sum + r.onHand, 0);
export const TOTAL_VALUE = STOCK.reduce((sum, r) => sum + r.value, 0);
export const DEAD_STOCK_VALUE = DEAD_STOCK.reduce((sum, r) => sum + r.value, 0);
export const LOW_STOCK_VALUE = LOW_STOCK.reduce((sum, r) => sum + r.value, 0);

export function stockForBranch(branchId: string): BranchStock[] {
  return STOCK.filter((r) => r.branchId === branchId);
}

export function stockForSku(sku: string): BranchStock[] {
  return STOCK.filter((r) => r.sku === sku);
}

export interface BranchSummaryRow {
  branchId: string;
  shortName: string;
  skus: number;
  units: number;
  value: number;
  deadStock: number;
  lowStock: number;
  outOfStock: number;
  healthPct: number;
}

export const BRANCH_SUMMARY: BranchSummaryRow[] = BRANCHES.map((branch) => {
  const records = stockForBranch(branch.id);
  const healthy = records.filter((r) => r.status === "In Stock").length;
  return {
    branchId: branch.id,
    shortName: branch.shortName,
    skus: records.length,
    units: records.reduce((sum, r) => sum + r.onHand, 0),
    value: records.reduce((sum, r) => sum + r.value, 0),
    deadStock: records.filter((r) => r.isDeadStock).length,
    lowStock: records.filter((r) => r.status === "Low Stock").length,
    outOfStock: records.filter((r) => r.status === "Out of Stock").length,
    healthPct: records.length === 0 ? 0 : (healthy / records.length) * 100,
  };
});

export interface CategorySummaryRow {
  name: PartCategory;
  units: number;
  value: number;
  positions: number;
}

export const CATEGORY_SUMMARY: CategorySummaryRow[] = (
  Object.keys(AISLE) as PartCategory[]
).map((category) => {
  const records = STOCK.filter((r) => r.part.category === category);
  return {
    name: category,
    units: records.reduce((sum, r) => sum + r.onHand, 0),
    value: records.reduce((sum, r) => sum + r.value, 0),
    positions: records.length,
  };
});
