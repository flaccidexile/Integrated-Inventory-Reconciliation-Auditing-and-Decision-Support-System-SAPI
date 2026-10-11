import { useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import type { PoStatus, PurchaseOrder } from "../types";
import { useSystemStore } from "../store/SystemStore";
import { KpiCard } from "../components/ui/KpiCard";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { FilterTabs } from "../components/ui/FilterTabs";
import { Paginator } from "../components/ui/Paginator";
import { EmptyState } from "../components/ui/EmptyState";
import { MONO, num, peso, pesoCompact, shortDate } from "../lib/format";

const STATUSES = [
  "All",
  "Draft",
  "Submitted",
  "Confirmed",
  "Partially Received",
  "Completed",
] as const;
type StatusFilter = (typeof STATUSES)[number];

/**
 * Procurement register. Readable by every role — a sales officer benefits from
 * knowing when a replenishment is due — but only management can create or
 * progress an order, since it commits company money.
 */
export function PurchaseOrdersPage() {
  const { purchaseOrders, permissions, busy, setPurchaseOrderStatus } = useSystemStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const perPage = 12;

  const openPos = useMemo(
    () => purchaseOrders.filter((po) => po.status !== "Completed" && po.status !== "Cancelled"),
    [purchaseOrders],
  );

  const filtered = useMemo(
    () =>
      statusFilter === "All"
        ? purchaseOrders
        : purchaseOrders.filter((po) => po.status === (statusFilter as PoStatus)),
    [purchaseOrders, statusFilter],
  );

  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const filteredTotal = filtered.reduce((sum, po) => sum + po.total, 0);

  const awaitingDelivery = openPos.filter(
    (po) => po.status === "Confirmed" || po.status === "Partially Received",
  ).length;

  async function advance(po: PurchaseOrder, status: PoStatus) {
    try {
      await setPurchaseOrderStatus(po.id, status);
    } catch {
      // The store surfaces the error through its own state; nothing to do here.
    }
  }

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "id",
      header: "PO number",
      render: (po) => (
        <span className="text-[12px] text-blue-600 font-medium whitespace-nowrap" style={MONO}>
          {po.id}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (po) => (
        <span className="text-[13px] text-[#1a1d23] font-medium whitespace-nowrap">
          {po.supplier}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      render: (po) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap" style={MONO}>
          {num(po.items)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total value",
      align: "right",
      render: (po) => (
        <span className="text-[13px] font-semibold text-[#1a1d23] whitespace-nowrap" style={MONO}>
          {peso(po.total)}
        </span>
      ),
    },
    {
      key: "orderDate",
      header: "Ordered",
      render: (po) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">
          {shortDate(po.orderDate)}
        </span>
      ),
    },
    {
      key: "deliveryDate",
      header: "Est. delivery",
      render: (po) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">
          {shortDate(po.deliveryDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (po) => <StatusBadge status={po.status} />,
    },
    {
      key: "action",
      header: "Action",
      render: (po) => {
        if (!permissions.canManagePurchaseOrders) {
          return <span className="text-[11px] text-[#adb5bd] whitespace-nowrap">View only</span>;
        }
        if (po.status === "Completed" || po.status === "Cancelled") {
          return <span className="text-[11px] text-[#adb5bd] whitespace-nowrap">Closed</span>;
        }
        const nextStatus: PoStatus =
          po.status === "Draft"
            ? "Submitted"
            : po.status === "Submitted"
              ? "Confirmed"
              : po.status === "Confirmed"
                ? "Partially Received"
                : "Completed";
        return (
          <Button size="sm" disabled={busy} onClick={() => void advance(po, nextStatus)}>
            Mark {nextStatus}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Open purchase orders"
          value={num(openPos.length)}
          sub={`of ${num(purchaseOrders.length)} total`}
          accent="blue"
        />
        <KpiCard
          label="Awaiting delivery"
          value={num(awaitingDelivery)}
          sub="Confirmed or partially received"
          accent="amber"
        />
        <KpiCard
          label="Committed spend"
          value={pesoCompact(openPos.reduce((sum, po) => sum + po.total, 0))}
          sub="Open orders not yet received"
          accent="blue"
        />
        <KpiCard
          label="Total PO value"
          value={pesoCompact(purchaseOrders.reduce((sum, po) => sum + po.total, 0))}
          sub="All orders in the register"
          accent="green"
        />
      </div>

      <Panel
        title="Purchase order register"
        subtitle={`${filtered.length} orders · ${peso(filteredTotal)} under the current filter`}
        actions={
          <FilterTabs
            label="Filter by purchase order status"
            options={STATUSES}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          />
        }
      >
        <DataTable
          caption="Supplier purchase orders"
          columns={columns}
          rows={rows}
          rowKey={(po) => po.id}
          empty={
            <EmptyState
              icon={ShoppingCart}
              title="No purchase orders"
              message="No orders match the selected status."
            />
          }
        />
        <Paginator
          page={page}
          total={filtered.length}
          perPage={perPage}
          onChange={setPage}
          itemLabel="orders"
        />
      </Panel>
    </div>
  );
}
