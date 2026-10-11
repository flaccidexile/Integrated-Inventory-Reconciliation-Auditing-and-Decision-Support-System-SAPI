import {
  ArrowLeftRight,
  ClipboardList,
  LayoutDashboard,
  Package,
  PieChart,
  Repeat,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { canAccessRoute, type RouteKey } from "../../shared/permissions";
import type { UserRole } from "../../shared/types";

export interface NavItem {
  /** Which permission entry governs this route. */
  key: RouteKey;
  to: string;
  label: string;
  icon: LucideIcon;
  subtitle: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/**
 * Navigation mirrors the four objectives of the proposal: the reconciliation
 * and audit group contains the three purpose-built modules, while supply chain
 * holds the operational registers they act upon.
 *
 * `key` ties each entry to `ROUTE_ROLES` in shared/permissions.ts, so the
 * sidebar a user sees is derived from their role rather than maintained as a
 * second, hand-written list.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Overview",
    items: [
      {
        key: "dashboard",
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        subtitle: "Reconciliation and operations overview",
      },
      {
        key: "analytics",
        to: "/analytics",
        label: "Discrepancy Analytics",
        icon: PieChart,
        subtitle: "Frequency, cost and root causes across all 8 branches",
      },
    ],
  },
  {
    heading: "Reconciliation & Audit",
    items: [
      {
        key: "cycleCounts",
        to: "/cycle-counts",
        label: "Cycle Counts",
        icon: ClipboardList,
        subtitle: "Targeted daily audits and printable blind-count sheets",
      },
      {
        key: "discrepancies",
        to: "/discrepancies",
        label: "Discrepancies",
        icon: ShieldAlert,
        subtitle: "Locked records awaiting manager approval",
      },
      {
        key: "matchmaker",
        to: "/matchmaker",
        label: "Dead-Stock Matchmaker",
        icon: Repeat,
        subtitle: "Automated inter-branch reallocation suggestions",
      },
    ],
  },
  {
    heading: "Supply Chain",
    items: [
      {
        key: "inventory",
        to: "/inventory",
        label: "Inventory",
        icon: Package,
        subtitle: "All parts and stock levels by branch",
      },
      {
        key: "transfers",
        to: "/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
        subtitle: "Inter-branch transfer requests",
      },
      {
        key: "purchaseOrders",
        to: "/purchase-orders",
        label: "Purchase Orders",
        icon: ShoppingCart,
        subtitle: "Supplier purchase orders and delivery schedule",
      },
      {
        key: "suppliers",
        to: "/suppliers",
        label: "Suppliers",
        icon: Truck,
        subtitle: "Supplier directory and performance",
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        key: "settings",
        to: "/settings",
        label: "Settings",
        icon: Settings,
        subtitle: "Company configuration, users and branches",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** The nav a given role may see, with empty sections removed. */
export function navSectionsForRole(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessRoute(role, item.key)),
  })).filter((section) => section.items.length > 0);
}

export function navItemForPath(pathname: string): NavItem {
  return ALL_NAV_ITEMS.find((item) => item.to === pathname) ?? ALL_NAV_ITEMS[0]!;
}
