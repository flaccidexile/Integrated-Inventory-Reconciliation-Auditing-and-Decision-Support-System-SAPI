import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Two clients, two jobs.
 *
 * `supabaseAdmin` uses the service-role key, which bypasses Row Level Security.
 * It is used only for operations that genuinely have no user context: seeding,
 * provisioning auth users, and verifying an access token. Nothing that a normal
 * request does should touch it.
 *
 * `clientForToken` builds a client that carries the caller's own JWT. Every
 * query it makes runs as that user, so the RLS policies in 0002_rls.sql are the
 * real authorization boundary. The API layer never re-implements a permission
 * check that the database already enforces — it only adds friendlier errors.
 */

const baseAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.serviceRoleKey || env.anonKey,
  { auth: { ...baseAuthOptions } },
);

export function clientForToken(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.anonKey, {
    auth: { ...baseAuthOptions },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** True when the service-role key is present, i.e. admin operations are usable. */
export const hasServiceRole = env.serviceRoleKey.length > 0;
