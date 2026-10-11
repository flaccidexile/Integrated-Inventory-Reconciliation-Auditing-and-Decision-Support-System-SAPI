import type { PoStatus, PurchaseOrder } from "../types";
import { SUPPLIERS } from "./suppliers";

const AS_OF_MS = new Date("2026-10-11T09:00:00+08:00").getTime();

function isoDaysAgo(days: number): string {
  return new Date(AS_OF_MS - days * 86_400_000).toISOString();
}

interface Seed {
  supplier: string;
  items: number;
  total: number;
  orderedDaysAgo: number;
  leadDays: number;
  status: PoStatus;
}

const SEEDS: Seed[] = [
  { supplier: "Bosch Philippines", items: 8, total: 284500, orderedDaysAgo: 46, leadDays: 16, status: "Completed" },
  { supplier: "Denso Philippines", items: 5, total: 156200, orderedDaysAgo: 44, leadDays: 14, status: "Completed" },
  { supplier: "Motolite Distribution", items: 200, total: 620000, orderedDaysAgo: 42, leadDays: 9, status: "Partially Received" },
  { supplier: "Gates Philippines", items: 12, total: 98400, orderedDaysAgo: 38, leadDays: 22, status: "Completed" },
  { supplier: "NGK Spark Plugs PH", items: 500, total: 187500, orderedDaysAgo: 35, leadDays: 16, status: "Completed" },
  { supplier: "KYB Philippines", items: 30, total: 234000, orderedDaysAgo: 29, leadDays: 24, status: "Partially Received" },
  { supplier: "Brembo Auth. Dealer", items: 20, total: 312000, orderedDaysAgo: 26, leadDays: 28, status: "Confirmed" },
  { supplier: "Monroe Philippines", items: 15, total: 198500, orderedDaysAgo: 21, leadDays: 26, status: "Confirmed" },
  { supplier: "Mann-Filter PH", items: 300, total: 145800, orderedDaysAgo: 18, leadDays: 17, status: "Confirmed" },
  { supplier: "ACDelco Philippines", items: 10, total: 267300, orderedDaysAgo: 14, leadDays: 30, status: "Submitted" },
  { supplier: "Exedy Clutch PH", items: 18, total: 131400, orderedDaysAgo: 9, leadDays: 20, status: "Submitted" },
  { supplier: "Bosch Philippines", items: 6, total: 212600, orderedDaysAgo: 5, leadDays: 16, status: "Submitted" },
  { supplier: "Denso Philippines", items: 24, total: 88900, orderedDaysAgo: 3, leadDays: 12, status: "Draft" },
  { supplier: "Motolite Distribution", items: 150, total: 465000, orderedDaysAgo: 2, leadDays: 8, status: "Draft" },
];

export const PURCHASE_ORDERS: PurchaseOrder[] = SEEDS.map((seed, i) => ({
  id: `PO-2026-${String(91 + i).padStart(4, "0")}`,
  supplier: seed.supplier,
  items: seed.items,
  total: seed.total,
  orderDate: isoDaysAgo(seed.orderedDaysAgo),
  deliveryDate: isoDaysAgo(seed.orderedDaysAgo - seed.leadDays),
  status: seed.status,
})).reverse();

export const OPEN_POS = PURCHASE_ORDERS.filter(
  (po) => po.status !== "Completed" && po.status !== "Cancelled",
);

export const PO_SPEND_TOTAL = PURCHASE_ORDERS.reduce((sum, po) => sum + po.total, 0);

export const PO_SPEND_THIS_PERIOD = PURCHASE_ORDERS.filter(
  (po) => new Date(po.orderDate).getMonth() >= 7,
).reduce((sum, po) => sum + po.total, 0);

export const ACTIVE_SUPPLIER_NAMES = [...new Set(OPEN_POS.map((po) => po.supplier))].filter(
  (name) => SUPPLIERS.some((s) => s.name === name),
);
