import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";

import { useAuth } from "./AuthProvider";
import { canAccessRoute, landingRouteFor, type RouteKey } from "../../../shared/permissions";
import { ROLE_LABELS } from "../../../shared/types";

/**
 * Blocks a route until a session exists.
 *
 * This is a *usability* gate, not the security boundary — anyone can edit a
 * client bundle. The data behind these routes is protected by Row Level
 * Security, so bypassing this component would reveal an empty shell, not
 * somebody else's inventory.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, profile, error } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f0f2f5]" role="status" aria-live="polite">
        <span className="text-[12px] text-[#6c757d]">Restoring your session…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f0f2f5] px-6">
        <div className="max-w-md text-center">
          <h1 className="text-[15px] font-semibold text-[#1a1d23] mb-2">Account not provisioned</h1>
          <p className="text-[12px] text-[#6c757d] mb-4">{error}</p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  if (status !== "signed-in" && status !== "demo") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/** Restricts a route to the roles listed for it in ROUTE_ROLES. */
export function RequireRole({ route, children }: { route: RouteKey; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return null;

  if (!canAccessRoute(profile.role, route)) {
    return (
      <div className="px-6 py-16 text-center">
        <h1 className="text-[15px] font-semibold text-[#1a1d23] mb-2">Not available to your role</h1>
        <p className="text-[12px] text-[#6c757d] max-w-md mx-auto">
          This module is restricted to other roles. You are signed in as{" "}
          <span className="font-medium text-[#495057]">{ROLE_LABELS[profile.role]}</span>.
        </p>
        <a
          href={`#${landingRouteFor(profile.role)}`}
          className="inline-block mt-4 px-3 py-1.5 rounded bg-[#0d6efd] text-white text-[12px] hover:bg-[#0b5ed7]"
        >
          Go to my dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="px-3 py-1.5 rounded bg-[#0d6efd] text-white text-[12px] hover:bg-[#0b5ed7]"
    >
      Sign out
    </button>
  );
}
