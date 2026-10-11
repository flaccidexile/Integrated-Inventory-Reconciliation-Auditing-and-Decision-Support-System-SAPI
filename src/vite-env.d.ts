/// <reference types="vite/client" />

/**
 * Environment variables the client reads.
 *
 * All three are optional: with none set the app runs in offline demo mode
 * against the bundled dataset, which is what makes it possible to present the
 * UI without a network.
 */
interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxxxxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable / anon key. Safe in the browser; RLS protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of the Express API. Defaults to "/api" via the Vite dev proxy. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
