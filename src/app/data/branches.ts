import type { Branch } from "../types";

/** The eight SAPI branches referenced throughout the proposal. */
export const BRANCHES: Branch[] = [
  {
    id: "BR-QC",
    name: "Quezon City (Main)",
    shortName: "QC Main",
    region: "Metro Manila",
    manager: "Marcos Reyes",
    address: "142 EDSA, Quezon City, Metro Manila",
    phone: "+63 2 8123 4567",
    isMain: true,
  },
  {
    id: "BR-BW",
    name: "Baliwag",
    shortName: "Baliwag",
    region: "Bulacan",
    manager: "Jose Garcia",
    address: "Brgy. Pagala, Baliwag, Bulacan",
    phone: "+63 44 766 1234",
    isMain: false,
  },
  {
    id: "BR-NZ",
    name: "Norzagaray",
    shortName: "Norzagaray",
    region: "Bulacan",
    manager: "Ramon Cruz",
    address: "Poblacion, Norzagaray, Bulacan",
    phone: "+63 44 693 7890",
    isMain: false,
  },
  {
    id: "BR-LG",
    name: "Legazpi",
    shortName: "Legazpi",
    region: "Albay",
    manager: "Ramon Villanueva",
    address: "Legazpi City, Albay",
    phone: "+63 52 480 1234",
    isMain: false,
  },
  {
    id: "BR-IL",
    name: "Iloilo",
    shortName: "Iloilo",
    region: "Iloilo",
    manager: "Carlo Dela Cruz",
    address: "Iloilo City, Iloilo",
    phone: "+63 33 321 5678",
    isMain: false,
  },
  {
    id: "BR-CB",
    name: "Cebu",
    shortName: "Cebu",
    region: "Cebu",
    manager: "Ana Santos",
    address: "Mandaue City, Cebu",
    phone: "+63 32 345 6789",
    isMain: false,
  },
  {
    id: "BR-DP",
    name: "Dipolog",
    shortName: "Dipolog",
    region: "Zamboanga del Norte",
    manager: "Mario Santos",
    address: "Dipolog City, Zamboanga del Norte",
    phone: "+63 65 212 3456",
    isMain: false,
  },
  {
    id: "BR-CDO",
    name: "Cagayan de Oro",
    shortName: "Cagayan",
    region: "Misamis Oriental",
    manager: "Elena Bautista",
    address: "Cagayan de Oro City, Misamis Oriental",
    phone: "+63 88 856 4321",
    isMain: false,
  },
];

const BRANCH_INDEX = new Map(BRANCHES.map((b) => [b.id, b]));

export function branchById(id: string): Branch {
  const branch = BRANCH_INDEX.get(id);
  if (!branch) throw new Error(`Unknown branch: ${id}`);
  return branch;
}

export function branchName(id: string): string {
  return BRANCH_INDEX.get(id)?.name ?? id;
}

export function branchShortName(id: string): string {
  return BRANCH_INDEX.get(id)?.shortName ?? id;
}
