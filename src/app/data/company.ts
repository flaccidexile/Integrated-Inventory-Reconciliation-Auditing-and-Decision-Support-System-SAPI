/** Organisation-level constants for the SAPI reconciliation system. */

export const COMPANY = {
  name: "Southwind Automotive Parts Inc.",
  shortName: "Southwind",
  abbr: "SAPI",
  system: "Inventory Reconciliation, Auditing & Decision Support System",
  hq: "142 EDSA, Quezon City, Metro Manila",
  phone: "+63 2 8123 4567",
  email: "ops@southwind.com.ph",
  website: "www.southwind.com.ph",
  branchCount: 8,
};

/** Fixed "today" for the seeded demo dataset. */
export const AS_OF = "2026-10-11";

export const AS_OF_LABEL = "Oct 11, 2026";

export const REPORTING_PERIOD = "Q3 2026";

/** Warehouse policy that shaped the Print & Encode workflow. */
export const NO_PHONE_POLICY =
  "Mobile phones are prohibited on the warehouse floor, so counts must be captured on paper.";
