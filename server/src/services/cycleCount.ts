import type { SupabaseClient } from "@supabase/supabase-js";

import { fromSupabaseError } from "../http";
import { buildCycleTasks } from "../../../shared/cycleCount";
import type { CycleTask } from "../../../shared/types";
import { CYCLE_TASK_COLUMNS, asRows, toCycleTask, type CycleTaskRow } from "../db/types";
import { fetchAssignees, fetchStock } from "./stock";

/**
 * Objective 1 — generates the targeted cycle-count queue.
 *
 * The ranking itself is the shared `buildCycleTasks` engine, so the API and the
 * client's offline demo produce identical sheets from identical inputs. What
 * this service adds is the database behaviour:
 *
 *   * A position that already has a live task (anything not yet Reconciled) is
 *     skipped rather than overwritten. Re-running "generate" therefore tops the
 *     queue up instead of destroying a sheet a warehouse clerk is halfway
 *     through counting.
 *   * The unique index `cycle_tasks_position_key` is the backstop: even if two
 *     supervisors generate at the same moment, Postgres rejects the duplicate.
 */

export interface GenerateCycleQueueOptions {
  /** How many bins to audit per branch. Defaults to a single realistic shift. */
  perBranch?: number;
  /** Overrides the assignee pool. Defaults to the active warehouse staff. */
  assignees?: string[];
}

export interface GenerateCycleQueueResult {
  created: number;
  skipped: number;
  /** The full live queue after generation, highest score first. */
  tasks: CycleTask[];
}

export async function generateCycleQueue(
  db: SupabaseClient,
  options: GenerateCycleQueueOptions = {},
): Promise<GenerateCycleQueueResult> {
  const perBranch = options.perBranch ?? 8;

  const [stock, assignees, existing] = await Promise.all([
    fetchStock(db),
    options.assignees && options.assignees.length > 0
      ? Promise.resolve(options.assignees)
      : fetchAssignees(db),
    fetchLiveTaskKeys(db),
  ]);

  const candidates = buildCycleTasks(stock, assignees, perBranch);
  const fresh = candidates.filter(
    (task) => !existing.has(`${task.sku}|${task.branchId}`),
  );

  if (fresh.length > 0) {
    const rows = fresh.map((task) => ({
      id: task.id,
      sku: task.sku,
      branch_id: task.branchId,
      bin_location: task.binLocation,
      priority: task.priority,
      score: task.score,
      days_since_count: task.daysSinceCount,
      days_since_transfer: task.daysSinceTransfer,
      abc_class: task.abcClass,
      reason: task.reason,
      status: task.status,
      assigned_to: task.assignedTo,
    }));

    const { error } = await db.from("cycle_tasks").insert(rows);
    if (error) throw fromSupabaseError(error);
  }

  return {
    created: fresh.length,
    skipped: candidates.length - fresh.length,
    tasks: await fetchCycleTasks(db),
  };
}

/** Keys of every position that still has an open task. */
async function fetchLiveTaskKeys(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db
    .from("cycle_tasks")
    .select("sku, branch_id")
    .neq("status", "Reconciled");

  if (error) throw fromSupabaseError(error);

  const rows = asRows<{ sku: string; branch_id: string }>(data);
  return new Set(rows.map((row) => `${row.sku}|${row.branch_id}`));
}

export interface CycleTaskFilters {
  branchId?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
}

export async function fetchCycleTasks(
  db: SupabaseClient,
  filters: CycleTaskFilters = {},
): Promise<CycleTask[]> {
  let query = db
    .from("cycle_tasks")
    .select(CYCLE_TASK_COLUMNS)
    .order("score", { ascending: false });

  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);

  const { data, error } = await query;
  if (error) throw fromSupabaseError(error);

  return asRows<CycleTaskRow>(data).map(toCycleTask);
}
