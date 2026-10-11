import { useMemo, useState } from "react";
import { Mail, Phone, Search, Truck } from "lucide-react";
import type { Supplier } from "../types";
import { useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { StarRating } from "../components/ui/StarRating";
import { Paginator } from "../components/ui/Paginator";
import { EmptyState } from "../components/ui/EmptyState";
import { MONO, num } from "../lib/format";

export function SuppliersPage() {
  const { suppliers } = useSystemStore();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suppliers.filter(
      (supplier) =>
        query === "" ||
        supplier.name.toLowerCase().includes(query) ||
        supplier.categories.toLowerCase().includes(query),
    );
  }, [suppliers, search]);

  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const activeCount = suppliers.filter((s) => s.status === "Active").length;

  /**
   * Derived from the live directory rather than the bundled constants, so the
   * figures track whatever `suppliers` actually holds in either mode.
   */
  const { avgLeadTime, avgRating } = useMemo(() => {
    if (suppliers.length === 0) return { avgLeadTime: 0, avgRating: 0 };
    return {
      avgLeadTime: suppliers.reduce((sum, s) => sum + s.leadTimeDays, 0) / suppliers.length,
      avgRating: suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length,
    };
  }, [suppliers]);

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      render: (supplier) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#e9ecef] flex items-center justify-center text-[11px] font-bold text-[#495057] shrink-0">
            {supplier.name.charAt(0)}
          </div>
          <span className="text-[13px] text-[#1a1d23] font-medium whitespace-nowrap">
            {supplier.name}
          </span>
        </div>
      ),
    },
    {
      key: "categories",
      header: "Categories",
      render: (supplier) => (
        <span className="text-[12px] text-[#495057]">{supplier.categories}</span>
      ),
      className: "max-w-[200px]",
    },
    {
      key: "contact",
      header: "Contact",
      render: (supplier) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <span className="text-[11px] text-[#6c757d] flex items-center gap-1">
            <Phone size={10} aria-hidden="true" />
            {supplier.phone}
          </span>
          <span className="text-[11px] text-[#6c757d] flex items-center gap-1">
            <Mail size={10} aria-hidden="true" />
            {supplier.email}
          </span>
        </div>
      ),
    },
    {
      key: "leadTime",
      header: "Lead time",
      align: "right",
      render: (supplier) => (
        <span className="text-[13px] font-semibold text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {supplier.leadTimeDays}d
        </span>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      render: (supplier) => (
        <StarRating rating={supplier.rating} label={`${supplier.name} rated ${supplier.rating} out of 5`} />
      ),
    },
    {
      key: "activePOs",
      header: "Active POs",
      align: "right",
      render: (supplier) => (
        <span className="text-[13px] font-semibold text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {num(supplier.activePOs)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (supplier) => <StatusBadge status={supplier.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total suppliers"
          value={num(suppliers.length)}
          sub="In the supplier directory"
          accent="blue"
        />
        <KpiCard
          label="Active"
          value={num(activeCount)}
          sub={`${num(suppliers.length - activeCount)} inactive`}
          accent="green"
        />
        <KpiCard
          label="Avg lead time"
          value={`${avgLeadTime.toFixed(1)} days`}
          sub="Across all suppliers"
          accent="blue"
        />
        <KpiCard
          label="Avg rating"
          value={`${avgRating.toFixed(2)} ★`}
          sub="Based on deliveries"
          accent="amber"
        />
      </div>

      <Panel
        title="Supplier directory"
        subtitle={`${filtered.length} suppliers`}
        actions={
          <div className="flex items-center gap-2 bg-[#f8f9fa] border border-[#dee2e6] rounded px-3 h-8 w-56">
            <Search size={13} className="text-[#adb5bd]" aria-hidden="true" />
            <label htmlFor="sup-search" className="sr-only">
              Search suppliers
            </label>
            <input
              id="sup-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search supplier or category…"
              className="bg-transparent text-[13px] text-[#495057] placeholder-[#adb5bd] outline-none flex-1 min-w-0"
            />
          </div>
        }
      >
        <DataTable
          caption="Supplier directory with lead times and ratings"
          columns={columns}
          rows={rows}
          rowKey={(supplier) => String(supplier.id)}
          empty={
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              message="No suppliers match your search term."
            />
          }
        />
        <Paginator
          page={page}
          total={filtered.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="suppliers"
        />
      </Panel>
    </div>
  );
}
