import type {
  AbcClass,
  Branch,
  BranchStock,
  CompanyInfo,
  CyclePriority,
  CycleTask,
  CycleTaskStatus,
  Discrepancy,
  DiscrepancyStatus,
  Part,
  PartCategory,
  PoStatus,
  PurchaseOrder,
  RootCause,
  SessionProfile,
  StockStatus,
  Supplier,
  Transfer,
  TransferStatus,
  UserRole,
} from "../../../shared/types";

/**
 * Row shapes as PostgREST returns them (snake_case, `numeric` as number), plus
 * the mappers that turn them into the camelCase domain model in shared/types.ts.
 *
 * Keeping the mapping in one place means a schema change is a one-file fix
 * rather than a hunt through every route.
 */

/**
 * The Supabase client here is deliberately untyped — there is no generated
 * `Database` interface — so `select()` widens its result to a string-error
 * union. These two helpers narrow that back down in one auditable place instead
 * of scattering `as unknown as X` through every route.
 */
export function asRows<Row>(data: unknown): Row[] {
  return (data ?? []) as Row[];
}

export function asRow<Row>(data: unknown): Row {
  return data as Row;
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

export interface BranchRow {
  id: string;
  name: string;
  short_name: string;
  region: string;
  manager: string;
  address: string;
  phone: string;
  is_main: boolean;
}

export interface PartRow {
  sku: string;
  name: string;
  category: PartCategory;
  brand: string;
  unit_cost: number | string;
  reorder_point: number;
  abc_class: AbcClass;
}

export interface StockEnrichedRow {
  sku: string;
  branch_id: string;
  on_hand: number;
  bin_location: string;
  days_since_movement: number;
  days_since_count: number;
  days_since_transfer: number | null;
  locked_by_discrepancy: string | null;
  part_name: string;
  category: PartCategory;
  brand: string;
  unit_cost: number | string;
  reorder_point: number;
  abc_class: AbcClass;
  branch_name: string;
  branch_short_name: string;
  branch_region: string;
  branch_manager: string;
  status: StockStatus;
  shortfall: number | string;
  value: number | string;
  is_dead_stock: boolean;
}

export interface CycleTaskRow {
  id: string;
  sku: string;
  branch_id: string;
  bin_location: string;
  priority: CyclePriority;
  score: number | string;
  days_since_count: number;
  days_since_transfer: number | null;
  abc_class: AbcClass;
  reason: string;
  status: CycleTaskStatus;
  assigned_to: string | null;
  generated_at: string;
  printed_at: string | null;
  counted_at: string | null;
  reconciled_at: string | null;
}

export interface DiscrepancyRow {
  id: string;
  sku: string;
  branch_id: string;
  bin_location: string;
  system_qty: number;
  counted_qty: number;
  variance: number;
  unit_cost: number | string;
  variance_value: number | string;
  root_cause: RootCause | null;
  status: DiscrepancyStatus;
  notes: string;
  raised_by: string;
  raised_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface TransferRow {
  id: string;
  sku: string;
  part_name: string;
  from_branch_id: string;
  to_branch_id: string;
  qty: number;
  requested_by: string;
  transfer_date: string;
  status: TransferStatus;
  auto_suggested: boolean;
}

export interface PurchaseOrderRow {
  id: string;
  supplier: string;
  items: number;
  total: number | string;
  order_date: string;
  delivery_date: string;
  status: PoStatus;
}

export interface SupplierRow {
  id: number;
  name: string;
  categories: string;
  phone: string;
  email: string;
  lead_time_days: number;
  rating: number | string;
  active_pos: number;
  status: "Active" | "Inactive";
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  job_title: string | null;
  status: "Active" | "Suspended";
}

export interface CompanyRow {
  name: string;
  short_name: string;
  abbr: string;
  system_name: string;
  hq: string;
  phone: string;
  email: string;
  website: string;
  branch_count: number;
  no_phone_policy: string;
}

/* ── Mappers ───────────────────────────────────────────────────────────── */

/** PostgREST may hand back `numeric` as a string; normalise once, here. */
function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    region: row.region,
    manager: row.manager,
    address: row.address,
    phone: row.phone,
    isMain: row.is_main,
  };
}

export function toPart(row: PartRow): Part {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    brand: row.brand,
    unitCost: toNumber(row.unit_cost),
    reorderPoint: row.reorder_point,
    abcClass: row.abc_class,
  };
}

export function toBranchStock(row: StockEnrichedRow): BranchStock {
  const part: Part = {
    sku: row.sku,
    name: row.part_name,
    category: row.category,
    brand: row.brand,
    unitCost: toNumber(row.unit_cost),
    reorderPoint: row.reorder_point,
    abcClass: row.abc_class,
  };
  const branch: Branch = {
    id: row.branch_id,
    name: row.branch_name,
    shortName: row.branch_short_name,
    region: row.branch_region,
    manager: row.branch_manager,
    address: "",
    phone: "",
    isMain: row.branch_id === "BR-QC",
  };
  return {
    sku: row.sku,
    branchId: row.branch_id,
    onHand: row.on_hand,
    binLocation: row.bin_location,
    daysSinceMovement: row.days_since_movement,
    daysSinceCount: row.days_since_count,
    daysSinceTransfer: row.days_since_transfer,
    part,
    branch,
    status: row.status,
    shortfall: toNumber(row.shortfall),
    value: toNumber(row.value),
    isDeadStock: row.is_dead_stock,
  };
}

export function toCycleTask(row: CycleTaskRow): CycleTask {
  return {
    id: row.id,
    sku: row.sku,
    branchId: row.branch_id,
    binLocation: row.bin_location,
    priority: row.priority,
    score: toNumber(row.score),
    daysSinceCount: row.days_since_count,
    daysSinceTransfer: row.days_since_transfer,
    abcClass: row.abc_class,
    reason: row.reason,
    status: row.status,
    assignedTo: row.assigned_to ?? "Unassigned",
  };
}

export function toDiscrepancy(row: DiscrepancyRow): Discrepancy {
  return {
    id: row.id,
    sku: row.sku,
    branchId: row.branch_id,
    binLocation: row.bin_location,
    systemQty: row.system_qty,
    countedQty: row.counted_qty,
    variance: row.variance,
    unitCost: toNumber(row.unit_cost),
    varianceValue: toNumber(row.variance_value),
    rootCause: row.root_cause,
    status: row.status,
    raisedBy: row.raised_by,
    raisedAt: row.raised_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    notes: row.notes,
  };
}

export function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    sku: row.sku,
    partName: row.part_name,
    fromBranchId: row.from_branch_id,
    toBranchId: row.to_branch_id,
    qty: row.qty,
    requestedBy: row.requested_by,
    date: row.transfer_date,
    status: row.status,
    autoSuggested: row.auto_suggested,
  };
}

export function toPurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    supplier: row.supplier,
    items: row.items,
    total: toNumber(row.total),
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
  };
}

export function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    categories: row.categories,
    phone: row.phone,
    email: row.email,
    leadTimeDays: row.lead_time_days,
    rating: toNumber(row.rating),
    activePOs: row.active_pos,
    status: row.status,
  };
}

export function toCompany(row: CompanyRow): CompanyInfo {
  return {
    name: row.name,
    shortName: row.short_name,
    abbr: row.abbr,
    system: row.system_name,
    hq: row.hq,
    phone: row.phone,
    email: row.email,
    website: row.website,
    branchCount: row.branch_count,
    noPhonePolicy: row.no_phone_policy,
  };
}

export function toSessionProfile(row: ProfileRow): SessionProfile {  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    branchId: row.branch_id,
    jobTitle: row.job_title,
    status: row.status,
  };
}

/** The column list the API selects — kept beside the row types on purpose. */
export const PROFILE_COLUMNS = "id, email, full_name, role, branch_id, job_title, status";

export const STOCK_ENRICHED_COLUMNS = [
  "sku", "branch_id", "on_hand", "bin_location",
  "days_since_movement", "days_since_count", "days_since_transfer",
  "locked_by_discrepancy", "part_name", "category", "brand", "unit_cost",
  "reorder_point", "abc_class", "branch_name", "branch_short_name",
  "branch_region", "branch_manager", "status", "shortfall", "value",
  "is_dead_stock",
].join(", ");

export const CYCLE_TASK_COLUMNS = [
  "id", "sku", "branch_id", "bin_location", "priority", "score",
  "days_since_count", "days_since_transfer", "abc_class", "reason",
  "status", "assigned_to", "generated_at", "printed_at", "counted_at",
  "reconciled_at",
].join(", ");

export const DISCREPANCY_COLUMNS = [
  "id", "sku", "branch_id", "bin_location", "system_qty", "counted_qty",
  "variance", "unit_cost", "variance_value", "root_cause", "status", "notes",
  "raised_by", "raised_at", "reviewed_by", "reviewed_at",
].join(", ");

export const TRANSFER_COLUMNS = [
  "id", "sku", "part_name", "from_branch_id", "to_branch_id", "qty",
  "requested_by", "transfer_date", "status", "auto_suggested",
].join(", ");

export const PO_COLUMNS =
  "id, supplier, items, total, order_date, delivery_date, status";

export const SUPPLIER_COLUMNS =
  "id, name, categories, phone, email, lead_time_days, rating, active_pos, status";

export const BRANCH_COLUMNS =
  "id, name, short_name, region, manager, address, phone, is_main";

export const PART_COLUMNS =
  "sku, name, category, brand, unit_cost, reorder_point, abc_class";

export const COMPANY_COLUMNS =
  "name, short_name, abbr, system_name, hq, phone, email, website, branch_count, no_phone_policy";
