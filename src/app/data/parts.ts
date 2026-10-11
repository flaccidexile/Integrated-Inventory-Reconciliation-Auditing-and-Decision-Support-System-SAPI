import type { Part, PartCategory } from "../types";

export const PART_CATEGORIES: PartCategory[] = [
  "Engine Parts",
  "Brakes",
  "Electrical",
  "Suspension",
  "Filters",
  "Exhaust",
  "Drivetrain",
  "Body Parts",
];

/**
 * Parts master. `reorderPoint` is the trigger level for a branch reorder,
 * `abcClass` drives how aggressively the cycle-count engine audits the part.
 */
export const PARTS: Part[] = [
  // Brakes
  { sku: "BRK-47291-A", name: "Front Brake Caliper Assembly", category: "Brakes", brand: "Bosch", unitCost: 3850, reorderPoint: 50, abcClass: "A" },
  { sku: "BRK-29841-B", name: "Brake Disc Rotor Pair", category: "Brakes", brand: "Brembo", unitCost: 4750, reorderPoint: 40, abcClass: "A" },
  { sku: "BRK-51120-C", name: "Brake Master Cylinder", category: "Brakes", brand: "Aisin", unitCost: 5200, reorderPoint: 20, abcClass: "B" },
  { sku: "BRK-77410-D", name: "Ceramic Brake Pad Set", category: "Brakes", brand: "Akebono", unitCost: 1850, reorderPoint: 120, abcClass: "A" },

  // Engine Parts
  { sku: "RAD-50129-A", name: "Radiator Assembly", category: "Engine Parts", brand: "Modine", unitCost: 12400, reorderPoint: 15, abcClass: "A" },
  { sku: "WPM-41237-C", name: "Water Pump", category: "Engine Parts", brand: "Gates", unitCost: 3100, reorderPoint: 30, abcClass: "B" },
  { sku: "ENG-84520-C", name: "Timing Belt Kit", category: "Engine Parts", brand: "Dayco", unitCost: 4200, reorderPoint: 15, abcClass: "A" },
  { sku: "ENG-90211-E", name: "Cylinder Head Gasket", category: "Engine Parts", brand: "Fel-Pro", unitCost: 2600, reorderPoint: 25, abcClass: "B" },
  { sku: "ENG-31876-F", name: "Piston Ring Set", category: "Engine Parts", brand: "NPR", unitCost: 3400, reorderPoint: 18, abcClass: "B" },

  // Electrical
  { sku: "ELE-19034-B", name: "Alternator 140A", category: "Electrical", brand: "Valeo", unitCost: 8500, reorderPoint: 30, abcClass: "A" },
  { sku: "IGN-29103-B", name: "Ignition Coil Set", category: "Electrical", brand: "Denso", unitCost: 1650, reorderPoint: 80, abcClass: "B" },
  { sku: "STA-61004-A", name: "Starter Motor 1.4kW", category: "Electrical", brand: "Bosch", unitCost: 6200, reorderPoint: 25, abcClass: "A" },
  { sku: "ELE-55231-A", name: "Battery 60Ah Maintenance-Free", category: "Electrical", brand: "Motolite", unitCost: 5800, reorderPoint: 40, abcClass: "A" },
  { sku: "ELE-77341-C", name: "Spark Plug Set (4pc)", category: "Electrical", brand: "NGK", unitCost: 980, reorderPoint: 150, abcClass: "A" },

  // Suspension
  { sku: "SUS-33410-D", name: "Rear Shock Absorber", category: "Suspension", brand: "KYB", unitCost: 2200, reorderPoint: 40, abcClass: "B" },
  { sku: "SUS-71023-A", name: "Front Strut Assembly", category: "Suspension", brand: "Monroe", unitCost: 5900, reorderPoint: 25, abcClass: "A" },
  { sku: "SUS-88410-B", name: "Stabilizer Link Kit", category: "Suspension", brand: "Moog", unitCost: 1150, reorderPoint: 60, abcClass: "C" },
  { sku: "SUS-22015-C", name: "Control Arm Bushing Set", category: "Suspension", brand: "Febest", unitCost: 1450, reorderPoint: 45, abcClass: "C" },

  // Filters
  { sku: "FLT-08823-C", name: "Engine Oil Filter", category: "Filters", brand: "Mann+Hummel", unitCost: 185, reorderPoint: 200, abcClass: "A" },
  { sku: "FLT-33719-D", name: "Air Filter Element", category: "Filters", brand: "K&N", unitCost: 820, reorderPoint: 100, abcClass: "A" },
  { sku: "FLT-66102-B", name: "Cabin Air Filter", category: "Filters", brand: "Denso", unitCost: 640, reorderPoint: 90, abcClass: "B" },
  { sku: "FLT-90557-A", name: "Fuel Filter", category: "Filters", brand: "Bosch", unitCost: 1150, reorderPoint: 70, abcClass: "B" },

  // Exhaust
  { sku: "EXH-72841-F", name: "Catalytic Converter", category: "Exhaust", brand: "Walker", unitCost: 18500, reorderPoint: 20, abcClass: "A" },
  { sku: "EXH-33920-G", name: "Muffler Assembly", category: "Exhaust", brand: "Bosal", unitCost: 6400, reorderPoint: 15, abcClass: "B" },

  // Drivetrain
  { sku: "TRS-88812-E", name: "Automatic Transmission Filter Kit", category: "Drivetrain", brand: "ATP", unitCost: 2800, reorderPoint: 20, abcClass: "B" },
  { sku: "DRV-40218-A", name: "CV Joint Boot Kit", category: "Drivetrain", brand: "GSP", unitCost: 1350, reorderPoint: 55, abcClass: "C" },
  { sku: "DRV-66430-C", name: "Clutch Disc Assembly", category: "Drivetrain", brand: "Exedy", unitCost: 7300, reorderPoint: 18, abcClass: "A" },

  // Body Parts
  { sku: "BDY-10288-A", name: "Side Mirror Assembly", category: "Body Parts", brand: "Depo", unitCost: 2950, reorderPoint: 20, abcClass: "C" },
  { sku: "BDY-55201-B", name: "Headlight Assembly", category: "Body Parts", brand: "Depo", unitCost: 8600, reorderPoint: 12, abcClass: "B" },
];

const PART_INDEX = new Map(PARTS.map((p) => [p.sku, p]));

export function partBySku(sku: string): Part {
  const part = PART_INDEX.get(sku);
  if (!part) throw new Error(`Unknown SKU: ${sku}`);
  return part;
}

export function partName(sku: string): string {
  return PART_INDEX.get(sku)?.name ?? sku;
}
