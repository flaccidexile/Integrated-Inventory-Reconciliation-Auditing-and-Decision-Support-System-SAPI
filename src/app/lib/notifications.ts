import type { BranchStock, CycleTask, Discrepancy, Transfer, UserRole } from "../../../shared/types";
import { num, peso } from "./format";

/**
 * The notification feed.
 *
 * What counts as a notification depends on who is signed in, because the three
 * roles are asked to do different things:
 *
 *   management  rule on discrepancy tickets, and release transfers
 *   warehouse   work the cycle-count queue, encode counts, execute transfers
 *   sales       watch availability at their own branch, chase transfer requests
 *
 * Everything here is derived from data the caller already holds, so the feed
 * costs nothing to build and cannot disagree with the screens it links to.
 *
 * The feed is a *prompt*, not the register itself: repetitive items (forty
 * out-of-stock lines, sixty cycle tasks) are aggregated into one line with a
 * count, because a bell that lists sixty things is a bell nobody reads. Items
 * that need an individual decision — a ticket awaiting approval, a transfer to
 * release — are listed one per row.
 */

export type NotificationTone = "danger" | "warning" | "info" | "success";

export interface AppNotification {
  id: string;
  title: string;
  /** The specific subject, e.g. "BRK-1042 · Brake Pad Set". */
  detail: string;
  /** Supporting figure, e.g. "Quezon City · ₱18,400 at risk". */
  meta: string;
  tone: NotificationTone;
  /** The route to open when the notification is actioned. */
  to: string;
}

export interface NotificationInput {
  role: UserRole;
  branchId: string | null;
  /** Open tickets only — Locked or Under Review. */
  openDiscrepancies: Discrepancy[];
  transfers: Transfer[];
  cycleTasks: CycleTask[];
  lowStock: BranchStock[];
  outOfStock: BranchStock[];
  branchShortName: (id: string) => string;
  partName: (sku: string) => string;
}

/** The largest number of individually-listed items any one role receives. */
const PER_ITEM_CAP = 6;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${num(count)} ${count === 1 ? singular : pluralForm}`;
}

function openTicket(d: Discrepancy, input: NotificationInput): AppNotification {
  return {
    id: `dsc:${d.id}`,
    title: d.status === "Locked" ? "Discrepancy awaiting approval" : "Discrepancy under review",
    detail: `${d.sku} · ${input.partName(d.sku)}`,
    meta: `${input.branchShortName(d.branchId)} · ${peso(d.varianceValue)} at risk`,
    tone: d.status === "Locked" ? "danger" : "warning",
    to: "/discrepancies",
  };
}

function pendingTransfer(t: Transfer, input: NotificationInput, verb: string): AppNotification {
  return {
    id: `tfr:${t.id}`,
    title: `${verb} — ${t.status}`,
    detail: `${t.sku} · ${input.partName(t.sku)}`,
    meta: `${input.branchShortName(t.fromBranchId)} → ${input.branchShortName(
      t.toBranchId,
    )} · ${num(t.qty)} units`,
    tone: t.status === "In Transit" ? "info" : "warning",
    to: "/transfers",
  };
}

/** Tickets awaiting a management ruling, highest exposure first. */
function managementFeed(input: NotificationInput): AppNotification[] {
  const tickets = [...input.openDiscrepancies]
    .sort((a, b) => b.varianceValue - a.varianceValue)
    .slice(0, PER_ITEM_CAP)
    .map((d) => openTicket(d, input));

  const pending = input.transfers.filter((t) => t.status === "Pending");
  const transfers: AppNotification[] =
    pending.length === 0
      ? []
      : [
          {
            id: "tfr:pending",
            title: "Transfers awaiting release",
            detail: `${plural(pending.length, "request")} in the dispatch queue`,
            meta: `${num(pending.reduce((sum, t) => sum + t.qty, 0))} units across the network`,
            tone: "warning",
            to: "/transfers",
          },
        ];

  return [...tickets, ...transfers];
}

/** Work the floor has to physically do: counts, tickets raised, transfers to move. */
function warehouseFeed(input: NotificationInput): AppNotification[] {
  const items: AppNotification[] = [];
  const branchId = input.branchId;

  // Scoped to the clerk's own branch. The full ranked queue is 64 bins, of which
  // 63 are Critical or High — reporting that number network-wide would be a
  // statistic, not a prompt. Eight bins at the branch they actually work in is
  // something a person can act on today.
  const myTasks = input.cycleTasks.filter(
    (t) => branchId === null || t.branchId === branchId,
  );
  const where = branchId === null ? "the network" : input.branchShortName(branchId);

  for (const [priority, tone] of [
    ["Critical", "danger"],
    ["High", "warning"],
  ] as const) {
    const due = myTasks.filter((t) => t.priority === priority && t.status !== "Reconciled");
    if (due.length === 0) continue;
    items.push({
      id: `cyc:${priority}`,
      title: `${priority} priority counts due at ${where}`,
      detail: `${plural(due.length, "bin")} still to count or reconcile`,
      meta: `Next: ${due[0]?.sku ?? "—"} · ${due[0]?.binLocation ?? "—"}`,
      tone,
      to: "/cycle-counts",
    });
  }

  const tickets = input.openDiscrepancies
    .filter((d) => branchId === null || d.branchId === branchId)
    .slice(0, PER_ITEM_CAP)
    .map((d) => openTicket(d, input));

  const mine = input.transfers.filter(
    (t) =>
      t.status !== "Completed" &&
      t.status !== "Rejected" &&
      (branchId === null || t.fromBranchId === branchId || t.toBranchId === branchId),
  );
  const transfers = mine
    .slice(0, PER_ITEM_CAP)
    .map((t) => pendingTransfer(t, input, "Transfer to move"));

  return [...items, ...tickets, ...transfers];
}

/** Availability at the branch the sales officer is quoting from. */
function salesFeed(input: NotificationInput): AppNotification[] {
  const items: AppNotification[] = [];
  const branchId = input.branchId;
  const at = (rows: BranchStock[]) =>
    branchId === null ? rows : rows.filter((row) => row.branchId === branchId);
  const where = branchId === null ? "the network" : input.branchShortName(branchId);

  const out = at(input.outOfStock);
  if (out.length > 0) {
    const worst = out.reduce((best, row) => (row.value > best.value ? row : best), out[0]);
    items.push({
      id: "stk:out",
      title: `${plural(out.length, "part")} out of stock`,
      detail: `At ${where} — cannot be promised to a customer`,
      meta: `Largest: ${worst.sku} · ${input.partName(worst.sku)}`,
      tone: "danger",
      to: "/inventory",
    });
  }

  const low = at(input.lowStock);
  if (low.length > 0) {
    items.push({
      id: "stk:low",
      title: `${plural(low.length, "part")} below reorder point`,
      detail: `At ${where} — confirm availability before quoting`,
      meta: "Check before committing to a delivery date",
      tone: "warning",
      to: "/inventory",
    });
  }

  const inbound = input.transfers.filter(
    (t) =>
      (t.status === "Pending" || t.status === "In Transit") &&
      (branchId === null || t.toBranchId === branchId),
  );
  items.push(
    ...inbound.slice(0, PER_ITEM_CAP).map((t) => pendingTransfer(t, input, "Transfer inbound")),
  );

  return items;
}

export function buildNotifications(input: NotificationInput): AppNotification[] {
  if (input.role === "management") return managementFeed(input);
  if (input.role === "warehouse") return warehouseFeed(input);
  return salesFeed(input);
}

/* ── Read state ────────────────────────────────────────────────────────────
 * Which notifications have been seen is a per-browser convenience, not a
 * system record, so it lives in localStorage rather than in Postgres. Every
 * access is guarded: private-mode browsers throw on write, and a corrupt value
 * must not take the header down with it.
 */

const READ_KEY = "sapi.notifications.read";

export function loadReadIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function saveReadIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable or full — the badge simply stays unread.
  }
}
