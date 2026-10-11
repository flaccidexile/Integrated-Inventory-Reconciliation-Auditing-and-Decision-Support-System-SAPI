import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError, param, queryString } from "../http";
import { auth, isWarehouseOrAbove, requireAuth } from "../middleware/auth";
import { parse, z } from "../validate";
import { fallbackId, isDuplicateKey, nextSequentialId } from "../services/ids";
import { shortName } from "../services/stock";
import { TRANSFER_COLUMNS, asRow, asRows, toTransfer, type TransferRow } from "../db/types";
import type { TransferStatus } from "../../../shared/types";

/**
 * Inter-branch transfers.
 *
 * All three roles may read them and *request* one — a sales officer who cannot
 * fill an order from their own shelf is the main source of demand signals. Only
 * management and warehouse staff may move a request along the pipeline, which
 * is enforced both here and in RLS.
 */

export const transfersRouter = Router();

/** The pipeline order, used to reject nonsensical transitions. */
const PIPELINE: TransferStatus[] = ["Pending", "Approved", "In Transit", "Completed"];

transfersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);

    let query = db
      .from("transfers")
      .select(TRANSFER_COLUMNS)
      .order("transfer_date", { ascending: false });

    const status = queryString(req, "status");
    const branch = queryString(req, "branch");
    const autoOnly = req.query.auto === "true";

    if (status) query = query.in("status", status.split(","));
    if (autoOnly) query = query.eq("auto_suggested", true);
    if (branch) {
      query = query.or(`from_branch_id.eq.${branch},to_branch_id.eq.${branch}`);
    }

    const { data, error } = await query;
    if (error) throw fromSupabaseError(error);

    const transfers = asRows<TransferRow>(data).map(toTransfer);
    res.json({
      transfers,
      count: transfers.length,
      pending: transfers.filter((t) => t.status === "Pending").length,
      inTransit: transfers.filter((t) => t.status === "In Transit").length,
      completed: transfers.filter((t) => t.status === "Completed").length,
      autoSuggested: transfers.filter((t) => t.autoSuggested).length,
    });
  }),
);

/* ── Request a transfer (any role) ─────────────────────────────────────── */

const createSchema = z.object({
  sku: z.string().min(1),
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  qty: z.number().int().positive().max(1_000_000),
});

transfersRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db, profile, userId } = auth(req);
    const body = parse(createSchema, req.body);

    if (body.fromBranchId === body.toBranchId) {
      throw HttpError.badRequest("A transfer needs two different branches.");
    }

    const { data: part, error: partError } = await db
      .from("parts")
      .select("name")
      .eq("sku", body.sku)
      .maybeSingle();

    if (partError) throw fromSupabaseError(partError);
    if (!part) throw HttpError.notFound(`No part with SKU ${body.sku}.`);

    const row = {
      sku: body.sku,
      part_name: asRow<{ name: string }>(part).name,
      from_branch_id: body.fromBranchId,
      to_branch_id: body.toBranchId,
      qty: body.qty,
      requested_by: shortName(profile.fullName),
      requested_by_id: userId,
      status: "Pending" as const,
      auto_suggested: false,
    };

    let id = await nextSequentialId(db, "transfers", "TF-2026-", 3);
    let attempt = await db.from("transfers").insert({ id, ...row }).select(TRANSFER_COLUMNS).single();

    if (attempt.error && isDuplicateKey(attempt.error)) {
      id = fallbackId("TF-2026-");
      attempt = await db.from("transfers").insert({ id, ...row }).select(TRANSFER_COLUMNS).single();
    }

    if (attempt.error) throw fromSupabaseError(attempt.error);
    res.status(201).json({ transfer: toTransfer(asRow<TransferRow>(attempt.data)) });
  }),
);

/* ── Progress a transfer ───────────────────────────────────────────────── */

const patchSchema = z.object({
  status: z.enum(["Pending", "Approved", "In Transit", "Completed", "Rejected"]),
});

transfersRouter.patch(
  "/:id",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const id = param(req, "id");
    const body = parse(patchSchema, req.body);

    const { data: existingRow, error: existingError } = await db
      .from("transfers")
      .select(TRANSFER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw fromSupabaseError(existingError);
    if (!existingRow) throw HttpError.notFound(`No transfer with id ${id}.`);

    const existing = toTransfer(asRow<TransferRow>(existingRow));
    if (existing.status === "Completed" || existing.status === "Rejected") {
      throw HttpError.conflict(`Transfer ${id} is already ${existing.status} and cannot be changed.`);
    }

    // Rejecting is always allowed from an open state. Otherwise movement must
    // be forward along the pipeline — no resurrecting a Completed transfer.
    if (body.status !== "Rejected") {
      const from = PIPELINE.indexOf(existing.status);
      const to = PIPELINE.indexOf(body.status);
      if (to !== -1 && from !== -1 && to < from) {
        throw HttpError.badRequest(
          `A transfer cannot move backwards from ${existing.status} to ${body.status}.`,
        );
      }
    }

    const { data, error } = await db
      .from("transfers")
      .update({ status: body.status })
      .eq("id", id)
      .select(TRANSFER_COLUMNS)
      .single();

    if (error) throw fromSupabaseError(error);
    res.json({ transfer: toTransfer(asRow<TransferRow>(data)) });
  }),
);
