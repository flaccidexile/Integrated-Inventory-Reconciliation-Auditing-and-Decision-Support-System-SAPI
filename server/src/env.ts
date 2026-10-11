import "dotenv/config";

/**
 * Environment loading. Every value is read once at boot so a misconfigured
 * deployment fails loudly on startup rather than at the first request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}.\n` +
        `Copy server/.env.example to server/.env and fill in the Supabase keys ` +
        `(Dashboard -> Project Settings -> API).`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

const supabaseUrl = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = optional("SUPABASE_SERVICE_ROLE_KEY", "");

if (!/^https?:\/\//.test(supabaseUrl)) {
  throw new Error(`SUPABASE_URL must be an absolute URL, got "${supabaseUrl}".`);
}

if (!serviceRoleKey) {
  console.warn(
    "[sapi] SUPABASE_SERVICE_ROLE_KEY is not set. Seeding, user provisioning " +
      "and a few administrative reads will fail. Everything else runs through " +
      "the caller's own token, so the API still works.",
  );
}

export const env = {
  supabaseUrl,
  anonKey,
  serviceRoleKey,
  port: Number(optional("PORT", "4000")),
  corsOrigins: optional("CORS_ORIGIN", "http://localhost:8443")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** The fixed "today" the demo dataset was generated against. */
  asOf: optional("SAPI_AS_OF", "2026-10-11"),
  nodeEnv: optional("NODE_ENV", "development"),
  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },
} as const;
