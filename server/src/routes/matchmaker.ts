import { Router } from "express";

import { asyncHandler, fromSupabaseError, HttpError } from "../http";
import { auth, isWarehouseOrAbove, requireAuth } from "../middleware/auth";
import { parse, z } from "../validate";
import { computeSuggestions } from "../services/matchmaker";
import { fallbackId, isDuplicateKey, nextSequentialId } from "../services/ids";
import { shortName } from "../services/stock";
import { TRANSFER_COLUMNS, asRow, toTransfer, type TransferRow } from "../db/types";

/**
 * Objective 4 — the dead-stock matchmaker.
 *
 * Accepting a suggestion turns it into a real inter-branch transfer request,
 * flagged `auto_suggested` so the audit trail shows the system proposed it
 * rather than a person. Dismissing records the decision so the same idea does
 * not resurface on every page load.
 */

export const matchmakerRouter = Router();

matchmakerRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { db } = auth(req);

    const raw = typeof req.query.minIdleDays === "string" ? Number(req.query.minIdleDays) : 90;
    const minIdleDays = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 3650) : 90;

    const result = await computeSuggestions(db, minIdleDays);
    res.json({ ...result, minIdleDays });
  }),
);

/* ── Accept: turn a suggestion into a transfer ─────────────────────────── */

const acceptSchema = z.object({
  sku: z.string().min(1),
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  qty: z.number().int().positive(),
  notes: z.string().max(300).optional(),
});

matchmakerRouter.post(
  "/accept",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db, profile, userId } = auth(req);
    const body = parse(acceptSchema, req.body);

    if (body.fromBranchId === body.toBranchId) {
      throw HttpError.badRequest("A transfer needs two different branches.");
    }

    const { data: part, error: partError } = await db
      .from("parts")
      .select("sku, name")
      .eq("sku", body.sku)
      .maybeSingle();

    if (partError) throw fromSupabaseError(partError);
    if (!part) throw HttpError.notFound(`No part with SKU ${body.sku}.`);

    const partName = asRow<{ name: string }>(part).name;
    const requester = shortName(profile.fullName);

    let id = await nextSequentialId(db, "transfers", "TF-2026-", 3);
    let attempt = await db
      .from("transfers")
      .insert({
        id,
        sku: body.sku,
        part_name: partName,
        from_branch_id: body.fromBranchId,
        to_branch_id: body.toBranchId,
        qty: body.qty,
        requested_by: requester,
        requested_by_id: userId,
        status: "Pending",
        auto_suggested: true,
      })
      .select(TRANSFER_COLUMNS)
      .single();

    if (attempt.error && isDuplicateKey(attempt.error)) {
      id = fallbackId("TF-2026-");
      attempt = await db
        .from("transfers")
        .insert({
          id,
          sku: body.sku,
          part_name: partName,
          from_branch_id: body.fromBranchId,
          to_branch_id: body.toBranchId,
          qty: body.qty,
          requested_by: requester,
          requested_by_id: userId,
          status: "Pending",
          auto_suggested: true,
        })
        .select(TRANSFER_COLUMNS)
        .single();
    }

    if (attempt.error) throw fromSupabaseError(attempt.error);

    // The suggestion is now suppressed because the matchmaker ignores pairs
    // that already have a live transfer — no extra bookkeeping needed.
    const refreshed = await computeSuggestions(db);

    res.status(201).json({
      transfer: toTransfer(asRow<TransferRow>(attempt.data)),
      suggestions: refreshed.suggestions,
      summary: refreshed.summary,
    });
  }),
);

/* ── Dismiss ───────────────────────────────────────────────────────────── */

const dismissSchema = z.object({
  sku: z.string().min(1),
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  reason: z.string().max(300).optional(),
});

matchmakerRouter.post(
  "/dismiss",
  requireAuth,
  isWarehouseOrAbove,
  asyncHandler(async (req, res) => {
    const { db, profile, userId } = auth(req);
    const body = parse(dismissSchema, req.body);

    const { error } = await db.from("match_suggestion_dismissals").upsert(
      {
        sku: body.sku,
        from_branch_id: body.fromBranchId,
        to_branch_id: body.toBranchId,
        reason: body.reason ?? null,
        dismissed_by: shortName(profile.fullName),
        dismissed_by_id: userId,
      },
      { onConflict: "sku,from_branch_id,to_branch_id" },
    );

    if (error) throw fromSupabaseError(error);

    const refreshed = await computeSuggestions(db);
    res.json({ suggestions: refreshed.suggestions, summary: refreshed.summary });
  }),
);
