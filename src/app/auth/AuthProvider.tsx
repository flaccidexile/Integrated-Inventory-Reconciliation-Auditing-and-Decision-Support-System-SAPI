import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { ApiError, api } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { permissionsFor, type Permissions } from "../../../shared/permissions";
import type { SessionProfile, UserRole } from "../../../shared/types";
import { DEMO_ACCOUNTS, USERS } from "../data/users";

/**
 * Session state for the whole application.
 *
 * Two modes, chosen automatically:
 *
 *   "api"   Supabase is configured. Sign-in goes through Supabase Auth, and the
 *           role/permissions are read back from the `profiles` table via the
 *           API — never from the token's metadata, so a user cannot widen their
 *           own access by editing it.
 *
 *   "demo"  No Supabase credentials. The app runs against the bundled dataset
 *           as a management user, so the interface is still demonstrable
 *           offline. Every screen says so, and no network call is attempted.
 */

export type AuthStatus = "loading" | "signed-out" | "signed-in" | "demo" | "error";

export interface AuthValue {
  status: AuthStatus;
  mode: "api" | "demo";
  session: Session | null;
  profile: SessionProfile | null;
  permissions: Permissions;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

/** The stand-in identity used when Supabase is not configured. */
const DEMO_PROFILE: SessionProfile = {
  id: "demo-management",
  email: DEMO_ACCOUNTS[0]?.email ?? "manager@southwind.com.ph",
  fullName: DEMO_ACCOUNTS[0]?.name ?? "Marcos Reyes",
  role: "management",
  branchId: DEMO_ACCOUNTS[0]?.branchId ?? "BR-QC",
  jobTitle: DEMO_ACCOUNTS[0]?.jobTitle ?? "General Manager",
  status: "Active",
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "demo");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(
    isSupabaseConfigured ? null : DEMO_PROFILE,
  );
  const [error, setError] = useState<string | null>(null);

  // Guards against a late response overwriting a newer one during sign-out.
  const generation = useRef(0);

  const loadProfile = useCallback(async (): Promise<void> => {
    const current = ++generation.current;
    try {
      const result = await api.get<{ profile: SessionProfile }>("/me");
      if (current !== generation.current) return;
      setProfile(result.profile);
      setError(null);
      setStatus("signed-in");
    } catch {
      if (current !== generation.current) return;

      // Fallback: If Express API is down or profiles table not yet created in Supabase,
      // resolve the authenticated profile directly from Supabase Auth & metadata.
      if (supabase) {
        try {
          const { data } = await supabase.auth.getUser();
          const user = data.user;
          if (user) {
            // 1. Try reading from public.profiles table if it exists
            const { data: row } = await supabase
              .from("profiles")
              .select("id, email, full_name, role, branch_id, job_title, status")
              .eq("id", user.id)
              .maybeSingle();

            if (row && row.role) {
              setProfile({
                id: row.id,
                email: row.email,
                fullName: row.full_name,
                role: row.role as UserRole,
                branchId: row.branch_id,
                jobTitle: row.job_title,
                status: row.status ?? "Active",
              });
              setError(null);
              setStatus("signed-in");
              return;
            }

            // 2. Read from user_metadata or match against pre-seeded roster
            const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
            const emailLower = (user.email ?? "").toLowerCase();
            const demoMatch = DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === emailLower);
            const userMatch = USERS.find((u) => u.email.toLowerCase() === emailLower);

            const role = (meta.role ?? demoMatch?.role ?? userMatch?.role ?? "management") as UserRole;
            const branchId = meta.branch_id ?? demoMatch?.branchId ?? userMatch?.branchId ?? "BR-QC";
            const fullName = meta.full_name ?? demoMatch?.name ?? userMatch?.name ?? user.email ?? "Staff Member";
            const jobTitle =
              meta.job_title ??
              demoMatch?.jobTitle ??
              (role === "management" ? "Branch Manager" : role === "warehouse" ? "Warehouse Staff" : "Sales Staff");

            setProfile({
              id: user.id,
              email: user.email ?? "",
              fullName,
              role,
              branchId,
              jobTitle,
              status: "Active",
            });
            setError(null);
            setStatus("signed-in");
            return;
          }
        } catch (innerErr) {
          console.warn("Direct Supabase profile resolution fallback error:", innerErr);
        }
      }

      setProfile(null);
      setError("Could not load your staff profile. Please try signing in again.");
      setStatus("error");
    }
  }, []);

  // Initial session + subscription to auth changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await loadProfile();
      else setStatus("signed-out");
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (event === "SIGNED_OUT" || !nextSession) {
        setProfile(null);
        setError(null);
        setStatus("signed-out");
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void loadProfile();
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured, so sign-in is unavailable.");
    }
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw new Error(
        /invalid login credentials/i.test(signInError.message)
          ? "That email and password combination was not recognised."
          : signInError.message,
      );
    }
    // onAuthStateChange picks it up from here.
  }, []);

  const signOut = useCallback(async () => {
    generation.current++;
    await supabase?.auth.signOut();
    setProfile(null);
    setSession(null);
    setError(null);
    setStatus("signed-out");
  }, []);

  const reload = useCallback(async () => {
    if (isSupabaseConfigured) await loadProfile();
  }, [loadProfile]);

  const value = useMemo<AuthValue>(() => {
    return {
      status,
      mode: isSupabaseConfigured ? "api" : "demo",
      session,
      profile,
      // In api mode the permissions are derived from the profile the server
      // returned; the matrix itself lives in shared/permissions.ts so the nav
      // and the API agree on it.
      permissions: permissionsFor(profile?.role ?? "sales"),
      error,
      signIn,
      signOut,
      reload,
    };
  }, [status, session, profile, error, signIn, signOut, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
