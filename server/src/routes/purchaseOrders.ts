import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError, param, queryString } from "../http";
import { auth, isManagement, requireAuth } from "../middleware/auth";
import { parse, z } from "../validate";
import { fallbackId, isDuplicateKey, nextSequentialId } from "../services/ids";
import { PO_COLUMNS, asRow, asRows, toPurchaseOrder, type PurchaseOrderRow } from "../db/types";

/**
 * Purchase orders. Readable by every role — a sales officer benefits from
 * knowing when a replenishment is due — but only management may create or
 * progress one, since it commits company money.
 */

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);

    let query = db
      .from("purchase_orders")
      .select(PO_COLUMNS)
      .order("order_date", { ascending: false });

    const status = queryString(req, "status");
    if (status) query = query.in("status", status.split(","));

    const { data, error } = await query;
    if (error) throw fromSupabaseError(error);

    const orders = asRows<PurchaseOrderRow>(data).map(toPurchaseOrder);
    const open = orders.filter((po) => po.status !== "Completed" && po.status !== "Cancelled");

    res.json({
      purchaseOrders: orders,
      count: orders.length,
      openCount: open.length,
      openValue: open.reduce((sum, po) => sum + po.total, 0),
      spendTotal: orders.reduce((sum, po) => sum + po.total, 0),
    });
  }),
);

const createSchema = z.object({
  supplier: z.string().min(1).max(160),
  items: z.number().int().min(0),
  total: z.number().min(0),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  status: z
    .enum(["Draft", "Submitted", "Confirmed", "Partially Received", "Completed", "Cancelled"])
    .optional(),
});

purchaseOrdersRouter.post(
  "/",
  requireAuth,
  isManagement,
  asyncHandler(async (req, res) => {
    const { db, userId } = auth(req);
    const body = parse(createSchema, req.body);

    const row = {
      supplier: body.supplier,
      items: body.items,
      total: body.total,
      order_date: body.orderDate,
      delivery_date: body.deliveryDate,
      status: body.status ?? ("Draft" as const),
      created_by: userId,
    };

    let id = await nextSequentialId(db, "purchase_orders", "PO-2026-", 4);
    let attempt = await db
      .from("purchase_orders")
      .insert({ id, ...row })
      .select(PO_COLUMNS)
      .single();

    if (attempt.error && isDuplicateKey(attempt.error)) {
      id = fallbackId("PO-2026-");
      attempt = await db
        .from("purchase_orders")
        .insert({ id, ...row })
        .select(PO_COLUMNS)
        .single();
    }

    if (attempt.error) throw fromSupabaseError(attempt.error);
    res.status(201).json({ purchaseOrder: toPurchaseOrder(asRow<PurchaseOrderRow>(attempt.data)) });
  }),
);

const patchSchema = z.object({
  status: z.enum(["Draft", "Submitted", "Confirmed", "Partially Received", "Completed", "Cancelled"]),
});

purchaseOrdersRouter.patch(
  "/:id",
  requireAuth,
  isManagement,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const id = param(req, "id");
    const body = parse(patchSchema, req.body);

    const { data, error } = await db
      .from("purchase_orders")
      .update({ status: body.status })
      .eq("id", id)
      .select(PO_COLUMNS)
      .maybeSingle();

    if (error) throw fromSupabaseError(error);
    if (!data) throw HttpError.notFound(`No purchase order with id ${id}.`);

    res.json({ purchaseOrder: toPurchaseOrder(asRow<PurchaseOrderRow>(data)) });
  }),
);
