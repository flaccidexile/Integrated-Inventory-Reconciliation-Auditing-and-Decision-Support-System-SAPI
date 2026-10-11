import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError, param, queryString } from "../http";
import { auth, isManagement, isWarehouseOrAbove, requireAuth } from "../middleware/auth";
import { parse, z } from "../validate";
import { shortName } from "../services/stock";
import { DISCREPANCY_COLUMNS, asRow, asRows, toDiscrepancy, type DiscrepancyRow } from "../db/types";
import { ROOT_CAUSE_VALUES, type DiscrepancyStatus } from "../../../shared/types";
import { raiseDiscrepancy } from "./cycleTasks";

/**
 * Objective 2 — the discrepancy approval workflow.
 *
 * The rule the proposal promises, and which this route enforces, is that a
 * mismatched count is *evidence*, not a correction. A warehouse clerk can raise
 * a ticket; only management can rule on it. The physical quantity is written
 * only on approval.
 *
 * Note that the route-level `isManagement` guard is a convenience. The real
 * control is the RLS policy: `discrepancies_update` is granted to management
 * alone, so even a bug that removed this middleware would not let a warehouse
 * clerk approve their own variance.
 */

export const discrepanciesRouter = Router();

const DECIDED: DiscrepancyStatus[] = ["Approved", "Rejected"];

/* ── Read ──────────────────────────────────────────────────────────────── */

discrepanciesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);

    let query = db
      .from("discrepancies")
      .select(DISCREPANCY_COLUMNS)
      .order("raised_at", { ascending: false });

    const status = queryString(req, "status");
    const branch = queryString(req, "branch");
    const cause = queryString(req, "cause");
    const search = queryString(req, "q");

    if (status === "open") query = query.in("status", ["Locked", "Under Review"]);
    else if (status) query = query.eq("status", status);
    if (branch) query = query.eq("branch_id", branch);
    if (cause) query = query.eq("root_cause", cause);
    if (search) {
      const escaped = search.replace(/[%,()]/g, " ").trim();
      query = query.or(`sku.ilike.%${escaped}%,id.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw fromSupabaseError(error);

    const tickets = asRows<DiscrepancyRow>(data).map(toDiscrepancy);
    const open = tickets.filter((t) => !DECIDED.includes(t.status));

    res.json({
      discrepancies: tickets,
      count: tickets.length,
      openCount: open.length,
      lockedValue: open.reduce((sum, t) => sum + t.varianceValue, 0),
      totalVarianceCost: tickets.reduce((sum, t) => sum + t.varianceValue, 0),
    });
  }),
);

/* ── Raise a ticket manually ───────────────────────────────────────────── */

const createSchema = z.object({
  sku: z.string().min(1),
  branchId: z.string().min(1),
  countedQty: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});

discrepanciesRouter.post(
  "/",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db, profile, userId } = auth(req);
    const body = parse(createSchema, req.body);

    const { data: positionRow, error: positionError } = await db
      .from("v_stock_enriched")
      .select("on_hand, bin_location, unit_cost")
      .eq("sku", body.sku)
      .eq("branch_id", body.branchId)
      .maybeSingle();

    if (positionError) throw fromSupabaseError(positionError);
    if (!positionRow) {
      throw HttpError.notFound(`No stock position for ${body.sku} at ${body.branchId}.`);
    }

    const position = positionRow as {
      on_hand: number;
      bin_location: string;
      unit_cost: number | string;
    };

    const ticket = await raiseDiscrepancy(db, {
      sku: body.sku,
      branchId: body.branchId,
      binLocation: position.bin_location,
      systemQty: position.on_hand,
      countedQty: body.countedQty,
      unitCost: Number(position.unit_cost),
      raisedBy: shortName(profile.fullName),
      raisedById: userId,
      notes: body.notes?.trim() || "Raised manually from the discrepancies register.",
    });

    const { error: lockError } = await db
      .from("stock_records")
      .update({ locked_by_discrepancy: ticket.id })
      .eq("sku", body.sku)
      .eq("branch_id", body.branchId);

    if (lockError) throw fromSupabaseError(lockError);

    res.status(201).json({ discrepancy: ticket });
  }),
);

/* ── Review (management only) ──────────────────────────────────────────── */

const reviewSchema = z
  .object({
    decision: z.enum(["Approved", "Rejected"]),
    rootCause: z.enum(ROOT_CAUSE_VALUES).nullish(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (value) => value.decision === "Rejected" || !!value.rootCause,
    { message: "A root cause is required when approving a discrepancy.", path: ["rootCause"] },
  );

discrepanciesRouter.post(
  "/:id/review",
  requireAuth,
  isManagement,
  asyncHandler(async (req, res) => {
    const { db, profile } = auth(req);
    const id = param(req, "id");
    const body = parse(reviewSchema, req.body);

    const { data: existingRow, error: existingError } = await db
      .from("discrepancies")
      .select(DISCREPANCY_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw fromSupabaseError(existingError);
    if (!existingRow) throw HttpError.notFound(`No discrepancy ticket with id ${id}.`);

    const existing = toDiscrepancy(asRow<DiscrepancyRow>(existingRow));
    if (DECIDED.includes(existing.status)) {
      throw HttpError.conflict(
        `Ticket ${id} was already ${existing.status} by ${existing.reviewedBy ?? "another reviewer"}.`,
      );
    }

    const now = new Date().toISOString();

    // Approving means the physical count was right, so the system figure is
    // corrected and the staleness clock resets. Rejecting means the system was
    // right, so nothing about the quantity changes — but the record must still
    // be released, or the bin stays frozen forever.
    const { error: stockError } = await db
      .from("stock_records")
      .update(
        body.decision === "Approved"
          ? { on_hand: existing.countedQty, days_since_count: 0, locked_by_discrepancy: null }
          : { locked_by_discrepancy: null },
      )
      .eq("sku", existing.sku)
      .eq("branch_id", existing.branchId);

    if (stockError) throw fromSupabaseError(stockError);

    const { data: updated, error: updateError } = await db
      .from("discrepancies")
      .update({
        status: body.decision,
        root_cause: body.decision === "Approved" ? body.rootCause : null,
        notes: body.notes?.trim() || existing.notes,
        reviewed_by: shortName(profile.fullName),
        reviewed_by_id: profile.id,
        reviewed_at: now,
      })
      .eq("id", id)
      .select(DISCREPANCY_COLUMNS)
      .single();

    if (updateError) throw fromSupabaseError(updateError);

    res.json({
      discrepancy: toDiscrepancy(asRow<DiscrepancyRow>(updated)),
      appliedToStock: body.decision === "Approved",
      quantityChanged: body.decision === "Approved" ? existing.variance : 0,
    });
  }),
);
