import { useState } from "react";
import { Bell, Building2, Globe, ShieldCheck, Users } from "lucide-react";
import { useSystemStore } from "../store/SystemStore";
import { Panel } from "../components/ui/Panel";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { Button } from "../components/ui/Button";
import { ROLE_LABELS } from "../types";
import type { Branch, SessionProfile } from "../types";
import { MONO, num } from "../lib/format";

type TabId = "general" | "users" | "branches" | "audit";

const TABS: { id: TabId; label: string; icon: typeof Globe }[] = [
  { id: "general", label: "General", icon: Globe },
  { id: "users", label: "Users", icon: Users },
  { id: "branches", label: "Branches", icon: Building2 },
  { id: "audit", label: "Audit & Notifications", icon: ShieldCheck },
];

const inputClass =
  "w-full h-9 px-3 text-[13px] text-[#1a1d23] border border-[#dee2e6] rounded bg-[#f8f9fa] outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all";

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general");

  const { company, branches, staff, branchById } = useSystemStore();

  const [lockOnVariance, setLockOnVariance] = useState(true);
  const [requireRootCause, setRequireRootCause] = useState(true);
  const [autoRoute, setAutoRoute] = useState(true);
  const [printEncode, setPrintEncode] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyCountReminder, setDailyCountReminder] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  const userColumns: Column<SessionProfile>[] = [
    {
      key: "name",
      header: "Name",
      render: (user) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-700 shrink-0">
            {user.fullName
              .split(" ")
              .filter(Boolean)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </div>
          <span className="text-[13px] text-[#1a1d23] font-medium whitespace-nowrap">
            {user.fullName}
          </span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (user) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">{ROLE_LABELS[user.role]}</span>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      render: (user) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">
          {user.branchId ? (branchById(user.branchId)?.name ?? user.branchId) : "Head office"}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (user) => <span className="text-[12px] text-[#6c757d]">{user.email}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (user) => <StatusBadge status={user.status} />,
    },
  ];

  const branchColumns: Column<Branch>[] = [
    {
      key: "name",
      header: "Branch",
      render: (branch) => (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
          <span className="text-[13px] text-[#1a1d23] font-medium whitespace-nowrap">
            {branch.name}
          </span>
          {branch.isMain ? (
            <span className="text-[10px] text-[#6c757d] border border-[#dee2e6] rounded px-1.5 py-0.5">
              Main
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "region",
      header: "Region",
      render: (branch) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">{branch.region}</span>
      ),
    },
    {
      key: "manager",
      header: "Manager",
      render: (branch) => (
        <span className="text-[12px] text-[#495057] whitespace-nowrap">{branch.manager}</span>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (branch) => <span className="text-[12px] text-[#6c757d]">{branch.address}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (branch) => (
        <span className="text-[12px] text-[#6c757d] whitespace-nowrap">{branch.phone}</span>
      ),
    },
  ];

  const auditRows: { label: string; sub: string; state: boolean; set: (v: boolean) => void }[] = [
    {
      label: "Lock records on count variance",
      sub: "Freeze the inventory record the moment an encoded count disagrees with the system.",
      state: lockOnVariance,
      set: setLockOnVariance,
    },
    {
      label: "Require a root cause before approval",
      sub: "Branch managers must classify the cause before any adjustment is applied.",
      state: requireRootCause,
      set: setRequireRootCause,
    },
    {
      label: "Auto-route tickets to branch managers",
      sub: "Discrepancy tickets are assigned to the manager of the branch where the count was taken.",
      state: autoRoute,
      set: setAutoRoute,
    },
    {
      label: "Print & Encode mode (no-phone policy)",
      sub: "Counts are captured on paper blind sheets because mobile phones are barred from the floor.",
      state: printEncode,
      set: setPrintEncode,
    },
    {
      label: "Low stock email alerts",
      sub: "Notify purchasing when a position falls below its reorder point.",
      state: lowStockAlerts,
      set: setLowStockAlerts,
    },
    {
      label: "Daily cycle count reminder",
      sub: "Send each branch its targeted audit list every morning at 7:00 AM (Asia/Manila).",
      state: dailyCountReminder,
      set: setDailyCountReminder,
    },
    {
      label: "Weekly discrepancy digest",
      sub: "Monday summary of new tickets, approvals and outstanding variance cost.",
      state: weeklyDigest,
      set: setWeeklyDigest,
    },
  ];

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex items-center gap-1 bg-white rounded border border-[#dee2e6] px-3 py-2 flex-wrap"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === id ? "bg-blue-600 text-white" : "text-[#6c757d] hover:bg-[#f8f9fa]"
            }`}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <Panel title="General settings" subtitle="Company information and system preferences" bodyClassName="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
            {[
              { label: "Company name", value: company.name },
              { label: "Business type", value: "Automotive Parts Distributor" },
              { label: "Head office", value: company.hq },
              { label: "Phone", value: company.phone },
              { label: "Email", value: company.email },
              { label: "Website", value: company.website },
            ].map(({ label, value }) => (
              <div key={label}>
                <label
                  htmlFor={`gen-${label}`}
                  className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
                >
                  {label}
                </label>
                <input id={`gen-${label}`} defaultValue={value} className={inputClass} />
              </div>
            ))}

            <div>
              <label
                htmlFor="gen-currency"
                className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
              >
                Currency
              </label>
              <select id="gen-currency" className={inputClass} defaultValue="PHP">
                <option value="PHP">Philippine Peso (PHP ₱)</option>
                <option value="USD">US Dollar (USD $)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="gen-timezone"
                className="block text-[11px] font-medium text-[#6c757d] uppercase tracking-wider mb-1.5"
              >
                Timezone
              </label>
              <select id="gen-timezone" className={inputClass} defaultValue="Asia/Manila">
                <option value="Asia/Manila">Asia/Manila (UTC+8)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#dee2e6]">
            <Button variant="primary" size="md">
              Save changes
            </Button>
          </div>
        </Panel>
      ) : null}

      {tab === "users" ? (
        <Panel
          title="User accounts"
          subtitle={`${staff.length} users in the system`}
          actions={<Button variant="primary">Invite user</Button>}
        >
          <DataTable
            caption="System user accounts with roles and branch assignment"
            columns={userColumns}
            rows={staff}
            rowKey={(user) => user.id}
          />
        </Panel>
      ) : null}

      {tab === "branches" ? (
        <Panel
          title="Branch configuration"
          subtitle={`${branches.length} branches registered across the network`}
          actions={<Button variant="primary">Add branch</Button>}
        >
          <DataTable
            caption="Registered branches with managers and contact details"
            columns={branchColumns}
            rows={branches}
            rowKey={(branch) => branch.id}
          />
        </Panel>
      ) : null}

      {tab === "audit" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Audit policy"
            subtitle="Rules enforced by the reconciliation engine"
            bodyClassName="px-6 py-2"
          >
            <div className="divide-y divide-[#f0f2f5]">
              {auditRows.slice(0, 4).map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1d23]">{row.label}</p>
                    <p className="text-[11px] text-[#6c757d] mt-0.5 leading-relaxed">{row.sub}</p>
                  </div>
                  <ToggleSwitch on={row.state} onChange={row.set} label={row.label} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Notifications"
            subtitle="Alerts sent to branch and purchasing staff"
            bodyClassName="px-6 py-2"
          >
            <div className="divide-y divide-[#f0f2f5]">
              {auditRows.slice(4).map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1d23]">{row.label}</p>
                    <p className="text-[11px] text-[#6c757d] mt-0.5 leading-relaxed">{row.sub}</p>
                  </div>
                  <ToggleSwitch on={row.state} onChange={row.set} label={row.label} />
                </div>
              ))}
            </div>
            <div className="py-4 border-t border-[#dee2e6]">
              <Button variant="primary">Save preferences</Button>
            </div>
          </Panel>

          <Panel
            className="lg:col-span-2"
            title="Enforcement summary"
            subtitle="What the current policy configuration means in practice"
            bodyClassName="p-6"
          >
            <ul className="space-y-2 text-[12px] text-[#495057] leading-relaxed">
              <li className="flex items-start gap-2">
                <Bell size={13} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>{num(4)} of 4 audit rules active.</strong>{" "}
                  {lockOnVariance
                    ? "Inventory records are locked immediately on variance"
                    : "Records stay editable on variance"}
                  , {requireRootCause ? "a root cause is mandatory" : "root cause is optional"} and{" "}
                  {autoRoute ? "tickets route automatically" : "tickets must be routed manually"}.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck size={13} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {printEncode
                    ? "Cycle counts are captured on printed blind sheets, keeping the workflow compliant with the warehouse no-phone policy."
                    : "Print & Encode mode is disabled — floor staff would need devices to encode counts."}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Building2 size={13} className="text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Coverage spans <strong>{branches.length} branches</strong> and{" "}
                  <strong style={MONO}>{num(staff.length)}</strong> user accounts.
                </span>
              </li>
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
