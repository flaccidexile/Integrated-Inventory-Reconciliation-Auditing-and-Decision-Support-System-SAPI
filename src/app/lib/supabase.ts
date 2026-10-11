import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser-side Supabase client.
 *
 * Only the publishable (anon) key is used here. It is safe to ship to the
 * browser because it grants nothing on its own — every table is protected by
 * Row Level Security, and the key only lets the user authenticate and then act
 * within the limits of their own role.
 *
 * When the environment variables are absent the client is `null` and the app
 * falls back to offline demo mode, which is deliberate: the UI should still be
 * demonstrable without a database connection.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Hash routing means there is never a `?code=` to pick up on load.
        detectSessionInUrl: false,
      },
    })
  : null;

/** Where the Express API lives. The Vite dev server proxies "/api" by default. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL?.trim() || "/api";

/** The current access token, or null when signed out / unconfigured. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
