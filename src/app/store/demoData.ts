import { BRANCHES } from "../data/branches";
import { PARTS } from "../data/parts";
import { STOCK } from "../data/stock";
import { DISCREPANCIES } from "../data/discrepancies";
import { TRANSFERS } from "../data/transfers";
import { PURCHASE_ORDERS } from "../data/purchaseOrders";
import { SUPPLIERS } from "../data/suppliers";
import { COMPANY, AS_OF, NO_PHONE_POLICY } from "../data/company";
import { AUDIT_ASSIGNEES, USERS } from "../data/users";
import { buildByMonth } from "../data/analytics";
import { buildCycleTasks, summariseCycleTasks } from "../../../shared/cycleCount";
import { buildMatchSuggestions, summariseMatches } from "../../../shared/matchmaker";
import { ROOT_CAUSE_VALUES } from "../../../shared/types";
import type {
  Branch,
  BranchStock,
  CycleSummary,
  CycleTask,
  DashboardKpis,
  Discrepancy,
  DiscrepancyAnalytics,
  DiscrepancyByBranch,
  DiscrepancyByCause,
  MatchSuggestion,
  MatchSummary,
  Part,
  PurchaseOrder,
  SessionProfile,
  Transfer,
} from "../../../shared/types";
import type { SystemSnapshot } from "./snapshot";

/**
 * The offline dataset.
 *
 * Used only when Supabase is not configured, so the interface can still be
 * demonstrated without a database. It is generated from the same modules that
 * produce `supabase/seed.sql`, so the demo figures match what a real deployment
 * shows for the seeded period.
 *
 * The KPI and analytics roll-ups are the one place where logic is duplicated:
 * in API mode Postgres computes them (`rpc_dashboard_kpis`,
 * `rpc_discrepancy_analytics`). Reproducing them here is the price of an offline
 * mode, and keeping them in one exported function makes that duplication
 * visible rather than scattered.
 */

/** The mutable collections demo mode owns. */
export interface DemoCollections {
  stock: BranchStock[];
  cycleTasks: CycleTask[];
  discrepancies: Discrepancy[];
  transfers: Transfer[];
  purchaseOrders: PurchaseOrder[];
  suggestions: MatchSuggestion[];
}

export interface DerivedFigures {
  kpis: DashboardKpis;
  analytics: DiscrepancyAnalytics;
  cycleSummary: CycleSummary;
  matchSummary: MatchSummary;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : round1((part / whole) * 100);
}

export function deriveKpis(
  collections: DemoCollections,
  parts: Part[],
  branches: Branch[],
): DashboardKpis {
  const { stock, discrepancies, transfers, purchaseOrders } = collections;

  const open = discrepancies.filter((t) => t.status === "Locked" || t.status === "Under Review");
  const decided = discrepancies.filter((t) => t.status === "Approved" || t.status === "Rejected");
  const ticketed = new Set(discrepancies.map((t) => `${t.sku}|${t.branchId}`));

  const deadStock = stock.filter((row) => row.isDeadStock);
  const lowStock = stock.filter((row) => row.status === "Low Stock");
  const outOfStock = stock.filter((row) => row.status === "Out of Stock");

  return {
    totalPositions: stock.length,
    totalUnits: stock.reduce((sum, row) => sum + row.onHand, 0),
    totalValue: stock.reduce((sum, row) => sum + row.value, 0),
    deadStockCount: deadStock.length,
    deadStockValue: deadStock.reduce((sum, row) => sum + row.value, 0),
    lowStockCount: lowStock.length,
    lowStockValue: lowStock.reduce((sum, row) => sum + row.value, 0),
    outOfStockCount: outOfStock.length,

    // Count accuracy: positions with a clean count record. Deliberately kept
    // separate from stock health, which is a level metric — blending the two
    // produces a number that means nothing.
    countAccuracy: percent(
      stock.filter((row) => !ticketed.has(`${row.sku}|${row.branchId}`)).length,
      stock.length,
    ),
    stockHealth: percent(
      stock.filter((row) => row.onHand >= row.part.reorderPoint).length,
      stock.length,
    ),

    openDiscrepancies: open.length,
    lockedValue: open.reduce((sum, t) => sum + t.varianceValue, 0),
    totalVarianceCost: discrepancies.reduce((sum, t) => sum + t.varianceValue, 0),
    resolvedThisMonth: decided.length,
    pendingTransfers: transfers.filter((t) => t.status === "Pending").length,
    inTransitTransfers: transfers.filter((t) => t.status === "In Transit").length,
    openPos: purchaseOrders.filter((po) => po.status !== "Completed" && po.status !== "Cancelled")
      .length,
    poSpendTotal: purchaseOrders.reduce((sum, po) => sum + po.total, 0),
    skuCount: parts.length,
    branchCount: branches.length,
  };
}

export function deriveAnalytics(
  collections: DemoCollections,
  branches: Branch[],
): DiscrepancyAnalytics {
  const { discrepancies, stock } = collections;

  const byBranch: DiscrepancyByBranch[] = branches
    .map((branch) => {
      const tickets = discrepancies.filter((t) => t.branchId === branch.id);
      const positions = stock.filter((row) => row.branchId === branch.id);
      const ticketed = new Set(tickets.map((t) => t.sku));
      return {
        branchId: branch.id,
        shortName: branch.shortName,
        discrepancies: tickets.length,
        cost: tickets.reduce((sum, t) => sum + t.varianceValue, 0),
        accuracyRate: percent(
          positions.filter((row) => !ticketed.has(row.sku)).length,
          positions.length,
        ),
      };
    })
    .sort((a, b) => b.discrepancies - a.discrepancies);

  const byCause: DiscrepancyByCause[] = ROOT_CAUSE_VALUES.map((cause) => {
    const matches = discrepancies.filter((t) => t.status === "Approved" && t.rootCause === cause);
    return {
      cause,
      count: matches.length,
      cost: matches.reduce((sum, t) => sum + t.varianceValue, 0),
    };
  }).sort((a, b) => b.count - a.count);

  return { byMonth: buildByMonth(discrepancies), byBranch, byCause };
}

/** Recomputes every derived figure from the current collections. */
export function deriveAll(
  collections: DemoCollections,
  parts: Part[],
  branches: Branch[],
): DerivedFigures {
  return {
    kpis: deriveKpis(collections, parts, branches),
    analytics: deriveAnalytics(collections, branches),
    cycleSummary: summariseCycleTasks(collections.cycleTasks),
    matchSummary: summariseMatches(collections.suggestions),
  };
}

/** The company block, which demo mode serves from the bundled constants. */
export function demoCompany() {
  return {
    name: COMPANY.name,
    shortName: COMPANY.shortName,
    abbr: COMPANY.abbr,
    system: COMPANY.system,
    hq: COMPANY.hq,
    phone: COMPANY.phone,
    email: COMPANY.email,
    website: COMPANY.website,
    branchCount: COMPANY.branchCount,
    noPhonePolicy: NO_PHONE_POLICY,
  };
}

/** The staff directory, in the shape `profiles` returns it. */
export function demoStaff(): SessionProfile[] {
  return [...USERS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.name,
      role: user.role,
      branchId: user.branchId,
      jobTitle:
        user.role === "management"
          ? "Branch Manager"
          : user.role === "warehouse"
            ? "Warehouse Staff"
            : "Sales Staff",
      status: user.status,
    }));
}

/** Builds the complete offline snapshot. Deterministic — safe to memoise. */
export function buildDemoSnapshot(): SystemSnapshot {
  const cycleTasks = buildCycleTasks(STOCK, AUDIT_ASSIGNEES);
  const suggestions = buildMatchSuggestions(STOCK);

  const collections: DemoCollections = {
    stock: STOCK,
    cycleTasks,
    discrepancies: DISCREPANCIES,
    transfers: TRANSFERS,
    purchaseOrders: PURCHASE_ORDERS,
    suggestions,
  };

  return {
    company: demoCompany(),
    branches: BRANCHES,
    parts: PARTS,
    suppliers: SUPPLIERS,
    staff: demoStaff(),
    ...collections,
    ...deriveAll(collections, PARTS, BRANCHES),
    asOf: AS_OF,
  };
}
