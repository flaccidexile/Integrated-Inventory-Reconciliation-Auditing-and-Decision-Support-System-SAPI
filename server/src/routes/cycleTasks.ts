import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError, param, queryString } from "../http";
import { auth, isManagement, isWarehouseOrAbove, requireAuth } from "../middleware/auth";
import { parse, z } from "../validate";
import { fetchCycleTasks, generateCycleQueue } from "../services/cycleCount";
import { shortName } from "../services/stock";
import { fallbackId, isDuplicateKey, nextSequentialId } from "../services/ids";
import { DISCREPANCY_COLUMNS, asRow, toDiscrepancy, type DiscrepancyRow } from "../db/types";
import type { CycleTaskStatus } from "../../../shared/types";

/**
 * Objective 1 — the cycle-count workflow.
 *
 * The route that matters is `POST /:id/reconcile`: it is the hinge between
 * Objective 1 and Objective 2. A clerk encodes the number they wrote on the
 * paper sheet; if it disagrees with the system, the record is locked and a
 * discrepancy ticket is raised for management. Nothing about the physical
 * quantity changes until that ticket is approved.
 */

export const cycleTasksRouter = Router();

const RECONCILABLE_STATUSES: CycleTaskStatus[] = ["Pending", "Sheet Printed", "Counted"];

/* ── Read ──────────────────────────────────────────────────────────────── */

cycleTasksRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const tasks = await fetchCycleTasks(db, {
      branchId: queryString(req, "branch"),
      status: queryString(req, "status"),
      priority: queryString(req, "priority"),
      assignedTo: queryString(req, "assignedTo"),
    });
    res.json({ tasks, count: tasks.length });
  }),
);

/* ── Generate the queue (management) ───────────────────────────────────── */

const generateSchema = z.object({
  perBranch: z.number().int().min(1).max(50).optional(),
  assignees: z.array(z.string().min(1)).max(20).optional(),
});

cycleTasksRouter.post(
  "/generate",
  requireAuth,
  isManagement,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const body = parse(generateSchema, req.body ?? {});
    const result = await generateCycleQueue(db, body);
    res.status(201).json(result);
  }),
);

/* ── Progress a task ───────────────────────────────────────────────────── */

const patchSchema = z.object({
  status: z.enum(["Pending", "Sheet Printed", "Counted"]).optional(),
  assignedTo: z.string().min(1).max(120).optional(),
});

cycleTasksRouter.patch(
  "/:id",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);
    const body = parse(patchSchema, req.body ?? {});

    const patch: Record<string, unknown> = {};
    if (body.status) patch.status = body.status;
    if (body.assignedTo) patch.assigned_to = body.assignedTo;

    if (Object.keys(patch).length === 0) {
      throw HttpError.badRequest("Provide a status or an assignee to update.");
    }
    if (body.status === "Sheet Printed") patch.printed_at = new Date().toISOString();

    const { data, error } = await db
      .from("cycle_tasks")
      .update(patch)
      .eq("id", param(req, "id"))
      .select("id")
      .maybeSingle();

    if (error) throw fromSupabaseError(error);
    if (!data) {
      // Either the task does not exist, or RLS refused because it belongs to
      // another branch — the two are indistinguishable by design.
      throw HttpError.forbidden(
        "That task could not be updated. It may not exist, or it may belong to another branch.",
      );
    }

    const tasks = await fetchCycleTasks(db);
    res.json({ tasks });
  }),
);

/* ── Encode a physical count ───────────────────────────────────────────── */

const reconcileSchema = z.object({
  countedQty: z.number().int().min(0).max(1_000_000),
  notes: z.string().max(500).optional(),
});

cycleTasksRouter.post(
  "/:id/reconcile",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db, profile, userId } = auth(req);
    const taskId = param(req, "id");
    const body = parse(reconcileSchema, req.body);

    const { data: taskRow, error: taskError } = await db
      .from("cycle_tasks")
      .select("id, sku, branch_id, bin_location, status")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError) throw fromSupabaseError(taskError);
    if (!taskRow) throw HttpError.notFound(`No cycle task with id ${taskId}.`);

    const task = asRow<{
      id: string;
      sku: string;
      branch_id: string;
      bin_location: string;
      status: CycleTaskStatus;
    }>(taskRow);

    if (!RECONCILABLE_STATUSES.includes(task.status)) {
      throw HttpError.conflict(`Task ${taskId} is already ${task.status}.`);
    }

    const { data: positionRow, error: positionError } = await db
      .from("v_stock_enriched")
      .select("on_hand, bin_location, unit_cost")
      .eq("sku", task.sku)
      .eq("branch_id", task.branch_id)
      .maybeSingle();

    if (positionError) throw fromSupabaseError(positionError);
    if (!positionRow) {
      throw HttpError.notFound(`Stock position ${task.sku} @ ${task.branch_id} no longer exists.`);
    }

    const position = asRow<{
      on_hand: number;
      bin_location: string;
      unit_cost: number | string;
    }>(positionRow);

    const systemQty = position.on_hand;
    const variance = body.countedQty - systemQty;
    const now = new Date().toISOString();

    let ticket: ReturnType<typeof toDiscrepancy> | null = null;

    if (variance !== 0) {
      ticket = await raiseDiscrepancy(db, {
        sku: task.sku,
        branchId: task.branch_id,
        binLocation: task.bin_location || position.bin_location,
        systemQty,
        countedQty: body.countedQty,
        unitCost: Number(position.unit_cost),
        raisedBy: shortName(profile.fullName),
        raisedById: userId,
        notes:
          body.notes?.trim() ||
          "Encoded count disagrees with the system quantity. Record locked pending manager review.",
      });

      // Freeze the position so it cannot be recounted while the ticket is open.
      const { error: lockError } = await db
        .from("stock_records")
        .update({ locked_by_discrepancy: ticket.id })
        .eq("sku", task.sku)
        .eq("branch_id", task.branch_id);

      if (lockError) throw fromSupabaseError(lockError);
    } else {
      // A clean count simply resets the staleness clock.
      const { error: touchError } = await db
        .from("stock_records")
        .update({ days_since_count: 0 })
        .eq("sku", task.sku)
        .eq("branch_id", task.branch_id);

      if (touchError) throw fromSupabaseError(touchError);
    }

    const { error: completeError } = await db
      .from("cycle_tasks")
      .update({ status: "Reconciled", counted_at: now, reconciled_at: now })
      .eq("id", taskId);

    if (completeError) throw fromSupabaseError(completeError);

    res.status(201).json({
      taskId,
      sku: task.sku,
      branchId: task.branch_id,
      systemQty,
      countedQty: body.countedQty,
      variance,
      matched: variance === 0,
      discrepancy: ticket,
    });
  }),
);

/* ── Shared: create a locked discrepancy ticket ────────────────────────── */

export interface RaiseDiscrepancyInput {
  sku: string;
  branchId: string;
  binLocation: string;
  systemQty: number;
  countedQty: number;
  unitCost: number;
  raisedBy: string;
  raisedById: string | null;
  notes: string;
}

/**
 * Inserts a `Locked` ticket. The id is sequential to match the seeded series,
 * with a timestamp fallback if two clerks encode at the same instant.
 */
export async function raiseDiscrepancy(
  db: ReturnType<typeof auth>["db"],
  input: RaiseDiscrepancyInput,
) {
  const base = {
    sku: input.sku,
    branch_id: input.branchId,
    bin_location: input.binLocation,
    system_qty: input.systemQty,
    counted_qty: input.countedQty,
    unit_cost: input.unitCost,
    root_cause: null,
    status: "Locked" as const,
    notes: input.notes,
    raised_by: input.raisedBy,
    raised_by_id: input.raisedById,
  };

  let id = await nextSequentialId(db, "discrepancies", "DSC-2026-", 4);
  let attempt = await db.from("discrepancies").insert({ id, ...base }).select(DISCREPANCY_COLUMNS).single();

  if (attempt.error && isDuplicateKey(attempt.error)) {
    id = fallbackId("DSC-2026-");
    attempt = await db.from("discrepancies").insert({ id, ...base }).select(DISCREPANCY_COLUMNS).single();
  }

  if (attempt.error) throw fromSupabaseError(attempt.error);
  return toDiscrepancy(asRow<DiscrepancyRow>(attempt.data));
}
