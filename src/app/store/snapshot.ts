import type {
  Branch,
  BranchStock,
  CompanyInfo,
  CycleSummary,
  CycleTask,
  DashboardKpis,
  Discrepancy,
  DiscrepancyAnalytics,
  MatchSuggestion,
  MatchSummary,
  Part,
  PurchaseOrder,
  SessionProfile,
  Supplier,
  Transfer,
} from "../../../shared/types";

/**
 * Everything the application needs to render, in one object.
 *
 * In API mode this is assembled from `GET /api/bootstrap`; in demo mode it is
 * built from the bundled dataset. Because both paths produce the same shape,
 * no component needs to know which one it is looking at.
 */
export interface SystemSnapshot {
  company: CompanyInfo;
  branches: Branch[];
  parts: Part[];
  suppliers: Supplier[];
  stock: BranchStock[];
  cycleTasks: CycleTask[];
  discrepancies: Discrepancy[];
  transfers: Transfer[];
  purchaseOrders: PurchaseOrder[];
  /** The staff directory, read from `profiles`. */
  staff: SessionProfile[];
  suggestions: MatchSuggestion[];
  matchSummary: MatchSummary;
  cycleSummary: CycleSummary;
  kpis: DashboardKpis;
  analytics: DiscrepancyAnalytics;
  asOf: string;
}

/** The bootstrap payload as the API sends it. */
export interface BootstrapResponse {
  company: CompanyInfo | null;
  branches: Branch[];
  parts: Part[];
  suppliers: Supplier[];
  stock: BranchStock[];
  cycleTasks: CycleTask[];
  discrepancies: Discrepancy[];
  transfers: Transfer[];
  purchaseOrders: PurchaseOrder[];
  staff: SessionProfile[];
  kpis: DashboardKpis;
  analytics: DiscrepancyAnalytics;
  cycleSummary: CycleSummary;
  matchmaker: { suggestions: MatchSuggestion[]; summary: MatchSummary };
  asOf: string;
}
