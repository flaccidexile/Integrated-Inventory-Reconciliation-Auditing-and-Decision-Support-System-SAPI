import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Package, Search } from "lucide-react";
import type { BranchStock } from "../types";
import { PART_CATEGORIES } from "../data/parts";
import { useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilterTabs } from "../components/ui/FilterTabs";
import { Paginator } from "../components/ui/Paginator";
import { EmptyState } from "../components/ui/EmptyState";
import { MONO, num, peso, pesoCompact } from "../lib/format";

const STATUSES = ["All", "In Stock", "Low Stock", "Out of Stock"] as const;
type StatusFilter = (typeof STATUSES)[number];

/**
 * Cross-branch stock availability.
 *
 * This is the one module every role can open, because a sales officer in
 * Dipolog needs to know whether Cebu can cover a customer's order. It is
 * read-only — stock is only ever written by the count-and-approve workflow.
 */
export function InventoryPage() {
  const { stock, branches, lowStock, outOfStock, kpis, branchShortName } = useSystemStore();
  const [params, setParams] = useSearchParams();
  const branchFilter = params.get("branch") ?? "ALL";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const perPage = 12;

  function setBranch(value: string) {
    const next = new URLSearchParams(params);
    if (value === "ALL") next.delete("branch");
    else next.set("branch", value);
    setParams(next, { replace: true });
    setPage(1);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return stock.filter((row) => {
      const matchesSearch =
        query === "" ||
        row.sku.toLowerCase().includes(query) ||
        row.part.name.toLowerCase().includes(query) ||
        row.part.brand.toLowerCase().includes(query);
      const matchesBranch = branchFilter === "ALL" || row.branchId === branchFilter;
      const matchesCategory = category === "All" || row.part.category === category;
      const matchesStatus = statusFilter === "All" || row.status === statusFilter;
      return matchesSearch && matchesBranch && matchesCategory && matchesStatus;
    });
  }, [stock, search, branchFilter, category, statusFilter]);

  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const filteredValue = filtered.reduce((sum, row) => sum + row.value, 0);

  const columns: Column<BranchStock>[] = [
    {
      key: "sku",
      header: "SKU",
      render: (row) => (
        <span className="text-[12px] text-blue-600 font-medium whitespace-nowrap" style={MONO}>
          {row.sku}
        </span>
      ),
    },
    {
      key: "part",
      header: "Part",
      render: (row) => (
        <div className="min-w-0 max-w-[240px]">
          <div className="text-[13px] text-[#1a1d23] truncate">{row.part.name}</div>
          <div className="text-[11px] text-[#6c757d]">
            {row.part.brand} · {row.part.category}
          </div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      render: (row) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">
          {branchShortName(row.branchId)}
        </span>
      ),
    },
    {
      key: "bin",
      header: "Bin",
      render: (row) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap" style={MONO}>
          {row.binLocation}
        </span>
      ),
    },
    {
      key: "onHand",
      header: "On hand",
      align: "right",
      render: (row) => (
        <span className="text-[13px] font-semibold text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(row.onHand)}
        </span>
      ),
    },
    {
      key: "reorder",
      header: "Reorder pt.",
      align: "right",
      render: (row) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap" style={MONO}>
          {num(row.part.reorderPoint)}
        </span>
      ),
    },
    {
      key: "idle",
      header: "Idle",
      align: "right",
      render: (row) => (
        <span
          className={`text-[12px] whitespace-nowrap ${
            row.isDeadStock ? "text-red-600 font-medium" : "text-[#6c757d]"
          }`}
          style={MONO}
        >
          {row.daysSinceMovement}d
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (row) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap" style={MONO}>
          {peso(row.value)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Inventory value"
          value={pesoCompact(kpis.totalValue)}
          sub={`${num(kpis.totalUnits)} units on hand`}
          accent="blue"
        />
        <KpiCard
          label="Stock positions"
          value={num(kpis.totalPositions)}
          sub={`${branches.length} branches`}
          accent="blue"
        />
        <KpiCard
          label="Low stock"
          value={num(lowStock.length)}
          sub="Below reorder point"
          accent="amber"
        />
        <KpiCard
          label="Out of stock"
          value={num(outOfStock.length)}
          sub="Zero units on hand"
          accent="red"
        />
        <KpiCard
          label="Dead stock value"
          value={pesoCompact(kpis.deadStockValue)}
          sub="Idle 90+ days"
          trend="down"
          delta="Matchmaker candidates"
          accent="red"
        />
      </div>

      <Panel
        title="Stock ledger"
        subtitle={`${filtered.length} positions · ${peso(filteredValue)} under the current filters`}
        actions={
          <>
            <div className="flex items-center gap-2 bg-[#f8f9fa] border border-[#dee2e6] rounded px-3 h-8 w-56">
              <Search size={13} className="text-[#adb5bd]" aria-hidden="true" />
              <label htmlFor="inv-search" className="sr-only">
                Search inventory by SKU, part or brand
              </label>
              <input
                id="inv-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search SKU, part or brand…"
                className="bg-transparent text-[13px] text-[#495057] placeholder-[#adb5bd] outline-none flex-1 min-w-0"
              />
            </div>

            <label htmlFor="inv-branch" className="sr-only">
              Filter by branch
            </label>
            <select
              id="inv-branch"
              value={branchFilter}
              onChange={(event) => setBranch(event.target.value)}
              className="text-[12px] text-[#495057] border border-[#dee2e6] rounded px-2.5 h-8 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label htmlFor="inv-category" className="sr-only">
              Filter by category
            </label>
            <select
              id="inv-category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="text-[12px] text-[#495057] border border-[#dee2e6] rounded px-2.5 h-8 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All categories</option>
              {PART_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <FilterTabs
              label="Filter by stock status"
              options={STATUSES}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            />
          </>
        }
      >
        <DataTable
          caption="Stock ledger by branch, with status and idle days"
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.sku}-${row.branchId}`}
          empty={
            <EmptyState
              icon={Package}
              title="No stock positions found"
              message="Try a different search term, branch, category or status filter."
            />
          }
        />
        <Paginator
          page={page}
          total={filtered.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="positions"
        />
      </Panel>
    </div>
  );
}
