/**
 * Design tokens for the SAPI reconciliation system.
 *
 * All status → class strings are written out in full (never composed at
 * runtime) so Tailwind's source scanner can see every utility it must emit.
 */

export const CHART_COLORS = [
  "#0d6efd",
  "#198754",
  "#ffc107",
  "#dc3545",
  "#6f42c1",
  "#0dcaf0",
  "#fd7e14",
  "#20c997",
];

export const BRAND = {
  primary: "#0d6efd",
  success: "#198754",
  warning: "#ffc107",
  danger: "#dc3545",
  purple: "#6f42c1",
  info: "#0dcaf0",
};

/** Single source of truth for every status pill in the system. */
export const STATUS_STYLES: Record<string, string> = {
  // Stock levels
  "In Stock": "bg-green-50 text-green-700 border border-green-200",
  "Low Stock": "bg-amber-50 text-amber-700 border border-amber-200",
  "Out of Stock": "bg-red-50 text-red-600 border border-red-200",

  // Audit priority
  Critical: "bg-red-50 text-red-600 border border-red-200",
  High: "bg-amber-50 text-amber-700 border border-amber-200",
  Medium: "bg-blue-50 text-blue-700 border border-blue-200",
  Low: "bg-gray-100 text-gray-600 border border-gray-200",

  // Cycle-count task states
  Pending: "bg-gray-100 text-gray-600 border border-gray-200",
  "Sheet Printed": "bg-blue-50 text-blue-700 border border-blue-200",
  Counted: "bg-amber-50 text-amber-700 border border-amber-200",
  Reconciled: "bg-green-50 text-green-700 border border-green-200",

  // Discrepancy workflow
  Locked: "bg-red-50 text-red-600 border border-red-200",
  "Under Review": "bg-amber-50 text-amber-700 border border-amber-200",
  Approved: "bg-green-50 text-green-700 border border-green-200",
  Rejected: "bg-gray-100 text-gray-600 border border-gray-200",

  // Transfers
  "In Transit": "bg-amber-50 text-amber-700 border border-amber-200",
  Completed: "bg-blue-50 text-blue-700 border border-blue-200",

  // Purchase orders
  Draft: "bg-gray-100 text-gray-600 border border-gray-200",
  Submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  Confirmed: "bg-green-50 text-green-700 border border-green-200",
  "Partially Received": "bg-amber-50 text-amber-700 border border-amber-200",
  Cancelled: "bg-red-50 text-red-600 border border-red-200",

  // Matchmaker
  Suggested: "bg-blue-50 text-blue-700 border border-blue-200",
  Accepted: "bg-green-50 text-green-700 border border-green-200",
  Dismissed: "bg-gray-100 text-gray-600 border border-gray-200",

  // Records
  Active: "bg-green-50 text-green-700 border border-green-200",
  Inactive: "bg-gray-100 text-gray-600 border border-gray-200",
  Suspended: "bg-red-50 text-red-600 border border-red-200",
};

export function statusClass(status: string): string {
  return STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border border-gray-200";
}

export const TREND_TEXT: Record<string, string> = {
  up: "text-green-600",
  down: "text-red-500",
  neutral: "text-[#adb5bd]",
};

export const ACCENT_BORDER: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-green-500",
  red: "border-l-red-500",
  amber: "border-l-amber-500",
};

export const ACCENT_TEXT: Record<string, string> = {
  blue: "text-blue-600",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
};

/** Palette used by the dead-stock matchmaker to colour root causes. */
export const CAUSE_COLORS: Record<string, string> = {
  Miscount: "#0d6efd",
  "Unrecorded Transfer": "#6f42c1",
  "Damaged Goods": "#dc3545",
  "Misplaced Item": "#fd7e14",
  "Supplier Short-Ship": "#0dcaf0",
  "Encoding Error": "#ffc107",
  "Theft / Shrinkage": "#343a40",
};
