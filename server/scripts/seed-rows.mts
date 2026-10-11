/**
 * The seed dataset, as plain row objects.
 *
 * Two scripts consume this:
 *   * `generate-seed.mts` renders it to `supabase/seed.sql` (the SQL-editor path)
 *   * `push-seed.mts` upserts it straight through the service-role client
 *
 * Deriving both from one definition means the two routes into the database
 * cannot drift apart.
 */

import { BRANCHES } from "../../src/app/data/branches";
import { PARTS } from "../../src/app/data/parts";
import { STOCK } from "../../src/app/data/stock";
import { DISCREPANCIES } from "../../src/app/data/discrepancies";
import { TRANSFERS } from "../../src/app/data/transfers";
import { PURCHASE_ORDERS } from "../../src/app/data/purchaseOrders";
import { SUPPLIERS } from "../../src/app/data/suppliers";
import { AUDIT_ASSIGNEES } from "../../src/app/data/users";
import { COMPANY, NO_PHONE_POLICY } from "../../src/app/data/company";
import { buildCycleTasks } from "../../shared/cycleCount";

export type SeedRow = Record<string, unknown>;

export interface SeedTable {
  table: string;
  columns: string[];
  rows: SeedRow[];
  /** `on conflict` target, e.g. "(id)" or "(sku, branch_id)". */
  conflict: string;
  /**
   * When true, an existing row is refreshed from the seed (reference data).
   * When false, an existing row is left alone (transactional data — a clerk may
   * have already progressed it).
   */
  upsert: boolean;
}

export function buildSeed(): SeedTable[] {
  const cycleTasks = buildCycleTasks(STOCK, AUDIT_ASSIGNEES);

  return [
    {
      table: "branches",
      columns: ["id", "name", "short_name", "region", "manager", "address", "phone", "is_main"],
      conflict: "(id)",
      upsert: true,
      rows: BRANCHES.map((x) => ({
        id: x.id,
        name: x.name,
        short_name: x.shortName,
        region: x.region,
        manager: x.manager,
        address: x.address,
        phone: x.phone,
        is_main: x.isMain,
      })),
    },
    {
      table: "parts",
      columns: ["sku", "name", "category", "brand", "unit_cost", "reorder_point", "abc_class"],
      conflict: "(sku)",
      upsert: true,
      rows: PARTS.map((x) => ({
        sku: x.sku,
        name: x.name,
        category: x.category,
        brand: x.brand,
        unit_cost: x.unitCost,
        reorder_point: x.reorderPoint,
        abc_class: x.abcClass,
      })),
    },
    {
      table: "suppliers",
      columns: ["id", "name", "categories", "phone", "email", "lead_time_days", "rating", "active_pos", "status"],
      conflict: "(id)",
      upsert: true,
      rows: SUPPLIERS.map((x) => ({
        id: x.id,
        name: x.name,
        categories: x.categories,
        phone: x.phone,
        email: x.email,
        lead_time_days: x.leadTimeDays,
        rating: x.rating,
        active_pos: x.activePOs,
        status: x.status,
      })),
    },
    {
      table: "company_settings",
      columns: ["id", "name", "short_name", "abbr", "system_name", "hq", "phone", "email", "website", "branch_count", "no_phone_policy"],
      conflict: "(id)",
      upsert: true,
      rows: [
        {
          id: true,
          name: COMPANY.name,
          short_name: COMPANY.shortName,
          abbr: COMPANY.abbr,
          system_name: COMPANY.system,
          hq: COMPANY.hq,
          phone: COMPANY.phone,
          email: COMPANY.email,
          website: COMPANY.website,
          branch_count: COMPANY.branchCount,
          no_phone_policy: NO_PHONE_POLICY,
        },
      ],
    },
    {
      table: "stock_records",
      columns: ["sku", "branch_id", "on_hand", "bin_location", "days_since_movement", "days_since_count", "days_since_transfer"],
      conflict: "(sku, branch_id)",
      upsert: false,
      rows: STOCK.map((x) => ({
        sku: x.sku,
        branch_id: x.branchId,
        on_hand: x.onHand,
        bin_location: x.binLocation,
        days_since_movement: x.daysSinceMovement,
        days_since_count: x.daysSinceCount,
        days_since_transfer: x.daysSinceTransfer,
      })),
    },
    {
      table: "discrepancies",
      columns: [
        "id", "sku", "branch_id", "bin_location", "system_qty", "counted_qty", "unit_cost",
        "root_cause", "status", "notes", "raised_by", "raised_at", "reviewed_by", "reviewed_at",
      ],
      conflict: "(id)",
      upsert: false,
      rows: DISCREPANCIES.map((x) => ({
        id: x.id,
        sku: x.sku,
        branch_id: x.branchId,
        bin_location: x.binLocation,
        system_qty: x.systemQty,
        counted_qty: x.countedQty,
        unit_cost: x.unitCost,
        // A rejected ticket means the system figure was right, so no root cause
        // is attributed — matching what the approval workflow does at runtime.
        root_cause: x.status === "Rejected" ? null : x.rootCause,
        status: x.status,
        notes: x.notes,
        raised_by: x.raisedBy,
        raised_at: x.raisedAt,
        reviewed_by: x.reviewedBy,
        reviewed_at: x.reviewedAt,
      })),
    },
    {
      table: "transfers",
      columns: ["id", "sku", "part_name", "from_branch_id", "to_branch_id", "qty", "requested_by", "transfer_date", "status", "auto_suggested"],
      conflict: "(id)",
      upsert: false,
      rows: TRANSFERS.map((x) => ({
        id: x.id,
        sku: x.sku,
        part_name: x.partName,
        from_branch_id: x.fromBranchId,
        to_branch_id: x.toBranchId,
        qty: x.qty,
        requested_by: x.requestedBy,
        transfer_date: x.date.slice(0, 10),
        status: x.status,
        auto_suggested: x.autoSuggested,
      })),
    },
    {
      table: "purchase_orders",
      columns: ["id", "supplier", "items", "total", "order_date", "delivery_date", "status"],
      conflict: "(id)",
      upsert: false,
      rows: PURCHASE_ORDERS.map((x) => ({
        id: x.id,
        supplier: x.supplier,
        items: x.items,
        total: x.total,
        order_date: x.orderDate.slice(0, 10),
        delivery_date: x.deliveryDate.slice(0, 10),
        status: x.status,
      })),
    },
    {
      table: "cycle_tasks",
      columns: [
        "id", "sku", "branch_id", "bin_location", "priority", "score", "days_since_count",
        "days_since_transfer", "abc_class", "reason", "status", "assigned_to",
      ],
      conflict: "(id)",
      upsert: false,
      rows: cycleTasks.map((x) => ({
        id: x.id,
        sku: x.sku,
        branch_id: x.branchId,
        bin_location: x.binLocation,
        priority: x.priority,
        score: x.score,
        days_since_count: x.daysSinceCount,
        days_since_transfer: x.daysSinceTransfer,
        abc_class: x.abcClass,
        reason: x.reason,
        status: x.status,
        assigned_to: x.assignedTo,
      })),
    },
  ];
}

/** Expected row count per table — used by both scripts as a self-check. */
export function seedCounts(tables: SeedTable[]): Record<string, number> {
  return Object.fromEntries(tables.map((t) => [t.table, t.rows.length]));
}
