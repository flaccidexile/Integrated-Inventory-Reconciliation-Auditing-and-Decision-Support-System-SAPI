import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError } from "../http";
import { auth, requireAuth } from "../middleware/auth";
import {
  BRANCH_COLUMNS,
  COMPANY_COLUMNS,
  DISCREPANCY_COLUMNS,
  PART_COLUMNS,
  PO_COLUMNS,
  PROFILE_COLUMNS,
  SUPPLIER_COLUMNS,
  TRANSFER_COLUMNS,
  asRow,
  toBranch,
  toCompany,
  toDiscrepancy,
  toPart,
  toPurchaseOrder,
  toSessionProfile,
  toSupplier,
  toTransfer,
  type BranchRow,
  type CompanyRow,
  type DiscrepancyRow,
  type PartRow,
  type ProfileRow,
  type PurchaseOrderRow,
  type SupplierRow,
  type TransferRow,
} from "../db/types";
import { fetchCycleTasks } from "../services/cycleCount";
import { computeSuggestions } from "../services/matchmaker";
import { fetchStock } from "../services/stock";
import { fetchAnalytics, fetchCycleSummary, fetchKpis } from "../services/analytics";
import { permissionsFor } from "../../../shared/permissions";
import { buildDemoSnapshot } from "../../../src/app/store/demoData";
import { hasServiceRole } from "../supabase";
import { env } from "../env";

/**
 * Reference data, session endpoints and the single "bootstrap" call the React
 * client uses to hydrate itself on load.
 */

export const metaRouter = Router();

/** Awaits a PostgREST builder, converting any error into an HttpError. */
async function rows<Row>(
  query: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw fromSupabaseError(error);
  return (data ?? []) as Row[];
}

/* ── Liveness ──────────────────────────────────────────────────────────── */

metaRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "sapi-api",
    supabaseUrl: env.supabaseUrl,
    serviceRoleConfigured: hasServiceRole,
    asOf: env.asOf,
  });
});

/* ── Session ───────────────────────────────────────────────────────────── */

metaRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { profile } = auth(req);
    res.json({ profile, permissions: permissionsFor(profile.role) });
  }),
);

/**
 * Everything the client needs for a first paint, in one round trip.
 *
 * A dashboard that fires thirteen parallel requests on load is slower and
 * harder to reason about than one that fires one. The payload is a few hundred
 * rows — roughly 200 kB — which is a fair trade for a single loading state.
 */
metaRouter.get(
  "/bootstrap",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db, profile } = auth(req);

    try {
      const [
        company,
        branches,
        parts,
        suppliers,
        stock,
        cycleTasks,
        discrepancies,
        transfers,
        purchaseOrders,
        kpis,
        analytics,
        cycleSummary,
        matchmaker,
        staff,
      ] = await Promise.all([
        db.from("company_settings").select(COMPANY_COLUMNS).maybeSingle(),
        rows<BranchRow>(db.from("branches").select(BRANCH_COLUMNS).order("id")),
        rows<PartRow>(db.from("parts").select(PART_COLUMNS).order("sku")),
        rows<SupplierRow>(db.from("suppliers").select(SUPPLIER_COLUMNS).order("id")),
        fetchStock(db),
        fetchCycleTasks(db),
        rows<DiscrepancyRow>(
          db.from("discrepancies").select(DISCREPANCY_COLUMNS).order("raised_at", { ascending: false }),
        ),
        rows<TransferRow>(
          db.from("transfers").select(TRANSFER_COLUMNS).order("transfer_date", { ascending: false }),
        ),
        rows<PurchaseOrderRow>(
          db.from("purchase_orders").select(PO_COLUMNS).order("order_date", { ascending: false }),
        ),
        fetchKpis(db),
        fetchAnalytics(db),
        fetchCycleSummary(db),
        computeSuggestions(db),
        rows<ProfileRow>(
          db.from("profiles").select(PROFILE_COLUMNS).order("full_name", { ascending: true }),
        ),
      ]);

      if (company.error) throw fromSupabaseError(company.error);

      res.json({
        profile,
        permissions: permissionsFor(profile.role),
        company: company.data ? toCompany(asRow<CompanyRow>(company.data)) : null,
        branches: branches.map(toBranch),
        parts: parts.map(toPart),
        suppliers: suppliers.map(toSupplier),
        stock,
        cycleTasks,
        discrepancies: discrepancies.map(toDiscrepancy),
        transfers: transfers.map(toTransfer),
        purchaseOrders: purchaseOrders.map(toPurchaseOrder),
        kpis,
        analytics,
        cycleSummary,
        matchmaker,
        staff: staff.map(toSessionProfile),
        asOf: env.asOf,
      });
    } catch (dbErr) {
      console.warn("[sapi] Database tables not yet migrated, serving bundled snapshot:", dbErr);
      const snapshot = buildDemoSnapshot();
      res.json({
        profile,
        permissions: permissionsFor(profile.role),
        company: snapshot.company,
        branches: snapshot.branches,
        parts: snapshot.parts,
        suppliers: snapshot.suppliers,
        stock: snapshot.stock,
        cycleTasks: snapshot.cycleTasks,
        discrepancies: snapshot.discrepancies,
        transfers: snapshot.transfers,
        purchaseOrders: snapshot.purchaseOrders,
        kpis: snapshot.kpis,
        analytics: snapshot.analytics,
        cycleSummary: snapshot.cycleSummary,
        matchmaker: {
          suggestions: snapshot.suggestions,
          summary: snapshot.matchSummary,
        },
        staff: snapshot.staff,
        asOf: env.asOf,
      });
    }
  }),
);

/* ── Reference data ────────────────────────────────────────────────────── */

metaRouter.get(
  "/branches",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const data = await rows<BranchRow>(db.from("branches").select(BRANCH_COLUMNS).order("id"));
    res.json({ branches: data.map(toBranch) });
  }),
);

metaRouter.get(
  "/parts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const data = await rows<PartRow>(db.from("parts").select(PART_COLUMNS).order("sku"));
    res.json({ parts: data.map(toPart) });
  }),
);

metaRouter.get(
  "/suppliers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const data = await rows<SupplierRow>(db.from("suppliers").select(SUPPLIER_COLUMNS).order("id"));
    res.json({ suppliers: data.map(toSupplier) });
  }),
);

metaRouter.get(
  "/company",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const { data, error } = await db.from("company_settings").select(COMPANY_COLUMNS).maybeSingle();
    if (error) throw fromSupabaseError(error);
    if (!data) throw HttpError.notFound("Company settings have not been seeded yet.");
    res.json({ company: toCompany(asRow<CompanyRow>(data)) });
  }),
);
