import { Router } from "express";

import { asyncHandler } from "../http";
import { auth, requireAuth } from "../middleware/auth";
import { fetchAnalytics, fetchCycleSummary, fetchKpis } from "../services/analytics";

/**
 * Objective 3 — the discrepancy analytics dashboard, plus the headline KPIs.
 *
 * All three endpoints are thin wrappers over the Postgres RPCs in
 * `0003_analytics.sql`. Keeping the aggregation in the database means the
 * numbers are computed from the same rows the register renders, in one
 * transaction, so a total can never disagree with the list beneath it.
 */

export const analyticsRouter = Router();

analyticsRouter.get(
  "/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    res.json({ kpis: await fetchKpis(db) });
  }),
);

analyticsRouter.get(
  "/discrepancies",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    res.json({ analytics: await fetchAnalytics(db) });
  }),
);

analyticsRouter.get(
  "/cycle-summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    res.json({ cycleSummary: await fetchCycleSummary(db) });
  }),
);

/** Everything the dashboard and analytics screens need, in one round trip. */
analyticsRouter.get(
  "/overview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const [kpis, analytics, cycleSummary] = await Promise.all([
      fetchKpis(db),
      fetchAnalytics(db),
      fetchCycleSummary(db),
    ]);
    res.json({ kpis, analytics, cycleSummary });
  }),
);
