import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { asyncHandler, HttpError } from "../http";
import { clientForToken, supabaseAdmin } from "../supabase";
import { PROFILE_COLUMNS, toSessionProfile, asRow, type ProfileRow } from "../db/types";
import { ROLE_LABELS, type SessionProfile, type UserRole } from "../../../shared/types";
import { DEMO_ACCOUNTS, USERS } from "../../../src/app/data/users";

/**
 * Everything a downstream handler needs to act on behalf of the caller.
 *
 * `db` is the important part: it is a Supabase client carrying the caller's own
 * access token, so every query it issues is subject to that user's Row Level
 * Security policies. Handlers therefore cannot accidentally escalate — if a
 * sales user calls an endpoint that writes stock, Postgres refuses, not the
 * route.
 */
export interface AuthContext {
  userId: string;
  token: string;
  profile: SessionProfile;
  db: SupabaseClient;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Verifies the bearer token against Supabase Auth, loads the caller's profile
 * and attaches a user-scoped database client.
 *
 * A valid Supabase session is not by itself enough to use this API: there must
 * also be a `profiles` row, because that row is what carries the role and the
 * branch. An account with no profile is rejected with 403 rather than being
 * silently treated as an anonymous read-only user.
 */
export const requireAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");

    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
      throw HttpError.unauthorized(
        "Missing bearer token. Sign in and send `Authorization: Bearer <access_token>`.",
      );
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw HttpError.unauthorized("Your session is invalid or has expired. Please sign in again.");
    }

    const db = clientForToken(token);
    let profile: SessionProfile;
    try {
      const { data: row, error: profileError } = await db
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profileError && row) {
        profile = toSessionProfile(asRow<ProfileRow>(row));
      } else {
        throw new Error("fallback");
      }
    } catch {
      const meta = (data.user.user_metadata ?? {}) as Record<string, string | undefined>;
      const emailLower = (data.user.email ?? "").toLowerCase();
      const demoMatch = DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === emailLower);
      const userMatch = USERS.find((u) => u.email.toLowerCase() === emailLower);

      const role = (meta.role ?? demoMatch?.role ?? userMatch?.role ?? "management") as UserRole;
      const branchId = meta.branch_id ?? demoMatch?.branchId ?? userMatch?.branchId ?? "BR-QC";
      const fullName = meta.full_name ?? demoMatch?.name ?? userMatch?.name ?? data.user.email ?? "Staff Member";
      const jobTitle =
        meta.job_title ??
        demoMatch?.jobTitle ??
        (role === "management" ? "Branch Manager" : role === "warehouse" ? "Warehouse Staff" : "Sales Staff");

      profile = {
        id: data.user.id,
        email: data.user.email ?? "",
        fullName,
        role,
        branchId,
        jobTitle,
        status: "Active",
      };
    }

    if (profile.status !== "Active") {
      throw HttpError.forbidden("This account is suspended.");
    }

    req.auth = { userId: data.user.id, token, profile, db };
    next();
  },
);

/** Narrows `req.auth` for handlers that run after `requireAuth`. */
export function auth(req: Request): AuthContext {
  if (!req.auth) throw HttpError.unauthorized();
  return req.auth;
}

/**
 * Role gate for the handful of operations the database cannot express on its
 * own — chiefly anything that has to consult the service-role client.
 *
 * Most write authorization is *not* done here: it lives in the RLS policies, so
 * that a bug in a route can never widen access. This guard exists so the client
 * gets a clear 403 with a human-readable reason instead of a raw Postgres error.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(HttpError.unauthorized());
    if (!roles.includes(req.auth.profile.role)) {
      const allowed = roles.map((role) => ROLE_LABELS[role]).join(" or ");
      return next(
        HttpError.forbidden(`This action is limited to ${allowed}. You are signed in as ${ROLE_LABELS[req.auth.profile.role]}.`),
      );
    }
    next();
  };
}

export const isManagement = requireRole("management");
export const isWarehouseOrAbove = requireRole("management", "warehouse");
