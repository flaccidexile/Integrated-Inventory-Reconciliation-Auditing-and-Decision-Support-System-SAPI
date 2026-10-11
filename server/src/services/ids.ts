import type { SupabaseClient } from "@supabase/supabase-js";
import { fromSupabaseError } from "../http";

/**
 * Human-readable identifiers for records created at runtime.
 *
 * The seeded data uses `DSC-2026-0052` and `TF-2026-003` style ids, and staff
 * quote those on the floor, so new rows continue the same series rather than
 * switching to a UUID. The next value is derived from the highest existing id
 * for that prefix, which keeps the sequence coherent instead of restarting from
 * the row count.
 *
 * Two clerks encoding at the same instant can still compute the same next id;
 * callers handle that by retrying with `fallbackId` when Postgres reports a
 * unique violation, so the tidy path stays tidy and the race still resolves.
 */
export async function nextSequentialId(
  db: SupabaseClient,
  table: string,
  prefix: string,
  width: number,
): Promise<string> {
  const { data, error } = await db
    .from(table)
    .select("id")
    .like("id", `${prefix}%`)
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw fromSupabaseError(error);

  const highest = (data ?? [])[0] as { id: string } | undefined;
  let next = 1;

  if (highest?.id) {
    const suffix = highest.id.slice(prefix.length);
    const digits = suffix.replace(/\D/g, "");
    const parsed = Number.parseInt(digits, 10);
    if (Number.isFinite(parsed)) next = parsed + 1;
  }

  return `${prefix}${String(next).padStart(width, "0")}`;
}

/** Collision fallback: still readable, and unique enough in practice. */
export function fallbackId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const noise = Math.floor(Math.random() * 46_656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `${prefix}${stamp}${noise}`;
}

/** True when a Supabase error is a unique-violation. */
export function isDuplicateKey(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
