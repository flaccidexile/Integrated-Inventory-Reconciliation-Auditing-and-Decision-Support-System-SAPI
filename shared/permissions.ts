import type { UserRole } from "./types";

/**
 * The permission matrix, in one place.
 *
 * This is the *presentation* layer of authorization: it decides which nav
 * entries appear and which buttons render. It is deliberately not the security
 * boundary — that is Row Level Security in `supabase/migrations/0002_rls.sql`.
 * If these two ever disagree, the database wins and the user gets a 403.
 */

export interface Permissions {
  /** Rebuild the cycle-count queue from current stock risk. */
  canGenerateCycleQueue: boolean;
  /** Reassign a cycle-count sheet to another clerk. */
  canAssignCycleTasks: boolean;
  /** Enter a physical count against a bin. */
  canEncodeCounts: boolean;
  /** Raise a discrepancy ticket when a count disagrees. */
  canRaiseDiscrepancy: boolean;
  /** Approve or reject a discrepancy ticket. Management only. */
  canReviewDiscrepancies: boolean;
  /** Ask for stock to be moved between branches. */
  canRequestTransfer: boolean;
  /** Move a transfer along its pipeline. */
  canExecuteTransfers: boolean;
  /** Dismiss a matchmaker suggestion. */
  canDismissSuggestions: boolean;
  /** Create and progress purchase orders. */
  canManagePurchaseOrders: boolean;
  /** Maintain the parts catalogue, branches and suppliers. */
  canManageCatalogue: boolean;
}

export function permissionsFor(role: UserRole): Permissions {
  const management = role === "management";
  const warehouse = role === "warehouse";

  return {
    canGenerateCycleQueue: management,
    canAssignCycleTasks: management,
    canEncodeCounts: management || warehouse,
    canRaiseDiscrepancy: management || warehouse,
    canReviewDiscrepancies: management,
    canRequestTransfer: true,
    canExecuteTransfers: management || warehouse,
    canDismissSuggestions: management || warehouse,
    canManagePurchaseOrders: management,
    canManageCatalogue: management,
  };
}

/**
 * Which roles may open each route. Mirrored by the API: every endpoint a route
 * depends on is gated by RLS or `requireRole`, so hiding a nav item is a
 * courtesy, not the control.
 */
export const ROUTE_ROLES = {
  dashboard: ["management", "warehouse", "sales"],
  analytics: ["management"],
  cycleCounts: ["management", "warehouse"],
  discrepancies: ["management", "warehouse"],
  matchmaker: ["management", "warehouse"],
  inventory: ["management", "warehouse", "sales"],
  transfers: ["management", "warehouse", "sales"],
  purchaseOrders: ["management"],
  suppliers: ["management"],
  settings: ["management"],
} as const satisfies Record<string, readonly UserRole[]>;

export type RouteKey = keyof typeof ROUTE_ROLES;

export function canAccessRoute(role: UserRole, key: RouteKey): boolean {
  return (ROUTE_ROLES[key] as readonly UserRole[]).includes(role);
}

/** The route a role should land on after signing in. */
export function landingRouteFor(role: UserRole): string {
  if (role === "sales") return "/inventory";
  if (role === "warehouse") return "/cycle-counts";
  return "/";
}
