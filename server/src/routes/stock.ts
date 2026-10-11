import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError } from "../http";
import { auth, requireAuth } from "../middleware/auth";
import { fetchStock } from "../services/stock";
import { STOCK_ENRICHED_COLUMNS, asRows, toBranchStock, type StockEnrichedRow } from "../db/types";

/**
 * Stock availability. Every role can read every branch — a sales officer in
 * Dipolog needs to know whether Cebu can cover a customer — which is why there
 * is no role filter here, only data filters.
 */

export const stockRouter = Router();

stockRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);

    const branchId = typeof req.query.branch === "string" ? req.query.branch : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const deadOnly = req.query.dead === "true";

    let query = db
      .from("v_stock_enriched")
      .select(STOCK_ENRICHED_COLUMNS)
      .order("branch_id", { ascending: true })
      .order("sku", { ascending: true });

    if (branchId) query = query.eq("branch_id", branchId);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (deadOnly) query = query.eq("is_dead_stock", true);
    if (search) {
      // PostgREST `or` syntax: match either the SKU or the part name.
      const escaped = search.replace(/[%,()]/g, " ").trim();
      query = query.or(`sku.ilike.%${escaped}%,part_name.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw fromSupabaseError(error);

    const stock = asRows<StockEnrichedRow>(data).map(toBranchStock);
    res.json({
      stock,
      count: stock.length,
      totalValue: stock.reduce((sum, row) => sum + row.value, 0),
    });
  }),
);

/** Every branch's position for one part — the "can anyone cover this?" lookup. */
stockRouter.get(
  "/:sku",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const sku = req.params.sku;
    if (!sku) throw HttpError.badRequest("A SKU is required.");

    const { data: part, error: partError } = await db
      .from("parts")
      .select("sku, name, category, brand, unit_cost, reorder_point, abc_class")
      .eq("sku", sku)
      .maybeSingle();

    if (partError) throw fromSupabaseError(partError);
    if (!part) throw HttpError.notFound(`No part with SKU ${sku}.`);

    const stock = await fetchStock(db);
    res.json({
      part,
      positions: stock.filter((row) => row.sku === sku),
    });
  }),
);
