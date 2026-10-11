import type { AppUser } from "../types";

/**
 * Demo roster used when the app runs in offline mode (no Supabase configured)
 * and as the provisioning list for the real `profiles` table — see
 * `server/scripts/provision-users.mts`, which creates one Supabase Auth user
 * per row here with the matching `role` and `branch_id` metadata.
 *
 * Only three roles exist: management, warehouse and sales.
 *
 *   management  Branch managers and the head office — they approve or reject
 *               every discrepancy ticket, which is why each branch manager
 *               appears in this group.
 *   warehouse   The staff who physically count the bins.
 *   sales       Counter and field sales staff who need cross-branch
 *               availability and can request a transfer.
 */
export const USERS: AppUser[] = [
  /* ── Management ──────────────────────────────────────────────────────── */
  { id: "U-001", name: "Marcos Reyes", role: "management", branchId: "BR-QC", email: "m.reyes@southwind.com.ph", status: "Active" },
  { id: "U-002", name: "Lorna Aquino", role: "management", branchId: "BR-QC", email: "l.aquino@southwind.com.ph", status: "Active" },
  { id: "U-003", name: "Erika Felipe", role: "management", branchId: "BR-QC", email: "e.felipe@southwind.com.ph", status: "Active" },
  { id: "U-004", name: "Jose Garcia", role: "management", branchId: "BR-BW", email: "j.garcia@southwind.com.ph", status: "Active" },
  { id: "U-005", name: "Ramon Cruz", role: "management", branchId: "BR-NZ", email: "r.cruz@southwind.com.ph", status: "Active" },
  { id: "U-006", name: "Ramon Villanueva", role: "management", branchId: "BR-LG", email: "r.villanueva@southwind.com.ph", status: "Active" },
  { id: "U-007", name: "Carlo Dela Cruz", role: "management", branchId: "BR-IL", email: "c.delacruz@southwind.com.ph", status: "Active" },
  { id: "U-008", name: "Ana Santos", role: "management", branchId: "BR-CB", email: "a.santos@southwind.com.ph", status: "Active" },
  { id: "U-009", name: "Mario Santos", role: "management", branchId: "BR-DP", email: "ma.santos@southwind.com.ph", status: "Active" },
  { id: "U-010", name: "Elena Bautista", role: "management", branchId: "BR-CDO", email: "e.bautista@southwind.com.ph", status: "Active" },

  /* ── Warehouse ───────────────────────────────────────────────────────── */
  { id: "U-011", name: "Julian Marteja", role: "warehouse", branchId: "BR-QC", email: "j.marteja@southwind.com.ph", status: "Active" },
  { id: "U-012", name: "Khella Catalan", role: "warehouse", branchId: "BR-CB", email: "k.catalan@southwind.com.ph", status: "Active" },
  { id: "U-013", name: "Generie Limco", role: "warehouse", branchId: "BR-IL", email: "g.limco@southwind.com.ph", status: "Active" },
  { id: "U-014", name: "Dennis Ocampo", role: "warehouse", branchId: "BR-BW", email: "d.ocampo@southwind.com.ph", status: "Active" },

  /* ── Sales ───────────────────────────────────────────────────────────── */
  { id: "U-015", name: "Maria Cruz", role: "sales", branchId: "BR-QC", email: "m.cruz@southwind.com.ph", status: "Active" },
  { id: "U-016", name: "Nestor Bautista", role: "sales", branchId: "BR-DP", email: "n.bautista@southwind.com.ph", status: "Active" },
  { id: "U-017", name: "Grace Villamor", role: "sales", branchId: "BR-CDO", email: "g.villamor@southwind.com.ph", status: "Active" },
  { id: "U-018", name: "Paolo Rivera", role: "sales", branchId: "BR-LG", email: "p.rivera@southwind.com.ph", status: "Active" },
];

/** Warehouse staff eligible to be assigned a printed blind-count sheet. */
export const AUDIT_ASSIGNEES = [
  "J. Marteja",
  "K. Catalan",
  "G. Limco",
  "D. Ocampo",
  "M. Reyes",
  "L. Aquino",
];

export function userById(id: string): AppUser | undefined {
  return USERS.find((u) => u.id === id);
}

export const DEFAULT_DEMO_PASSWORD =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_PASSWORD) || "Southwind#2026";

/** The three demo accounts used to sign in to the live system. */
export interface DemoAccount {
  email: string;
  name: string;
  role: AppUser["role"];
  branchId: string;
  jobTitle: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "manager@southwind.com.ph",
    name: "Marcos Reyes",
    role: "management",
    branchId: "BR-QC",
    jobTitle: "General Manager",
  },
  {
    email: "warehouse@southwind.com.ph",
    name: "Julian Marteja",
    role: "warehouse",
    branchId: "BR-QC",
    jobTitle: "Warehouse Supervisor",
  },
  {
    email: "sales@southwind.com.ph",
    name: "Maria Cruz",
    role: "sales",
    branchId: "BR-QC",
    jobTitle: "Sales Officer",
  },
];
