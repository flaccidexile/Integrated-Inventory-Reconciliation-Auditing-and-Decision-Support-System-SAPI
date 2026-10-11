import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCircle2, ChevronRight } from "lucide-react";

import { useAuth } from "../../auth/AuthProvider";
import { useSystemStore } from "../../store/SystemStore";
import {
  buildNotifications,
  loadReadIds,
  saveReadIds,
  type NotificationTone,
} from "../../lib/notifications";

/**
 * The header bell.
 *
 * It previously had no handler at all — clicking it did nothing. It now opens a
 * disclosure panel listing the items that need the signed-in user's attention,
 * filtered by role (see `lib/notifications.ts`).
 *
 * Read state is tracked per notification id in localStorage, so the badge counts
 * what is genuinely *new* to this person rather than repeating the same open
 * ticket count forever. Ids that no longer correspond to a live notification are
 * pruned, so the stored list cannot grow without bound.
 */

const TONE_DOT: Record<NotificationTone, string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  success: "bg-green-500",
};

export function NotificationsMenu() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const {
    openDiscrepancies,
    transfers,
    cycleTasks,
    lowStock,
    outOfStock,
    branchShortName,
    partName,
  } = useSystemStore();

  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const role = profile?.role ?? "sales";
  const branchId = profile?.branchId ?? null;

  const notifications = useMemo(
    () =>
      buildNotifications({
        role,
        branchId,
        openDiscrepancies,
        transfers,
        cycleTasks,
        lowStock,
        outOfStock,
        branchShortName,
        partName,
      }),
    [
      role,
      branchId,
      openDiscrepancies,
      transfers,
      cycleTasks,
      lowStock,
      outOfStock,
      branchShortName,
      partName,
    ],
  );

  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = notifications.filter((item) => !readSet.has(item.id)).length;

  // Drop ids for notifications that no longer exist. Returning the previous
  // array when nothing changed keeps this from looping.
  useEffect(() => {
    const live = new Set(notifications.map((item) => item.id));
    setReadIds((previous) => {
      const pruned = previous.filter((id) => live.has(id));
      if (pruned.length === previous.length) return previous;
      saveReadIds(pruned);
      return pruned;
    });
  }, [notifications]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markRead = useCallback((id: string) => {
    setReadIds((previous) => {
      if (previous.includes(id)) return previous;
      const next = [...previous, id];
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const next = notifications.map((item) => item.id);
    saveReadIds(next);
    setReadIds(next);
  }, [notifications]);

  const openItem = useCallback(
    (id: string, to: string) => {
      markRead(id);
      setOpen(false);
      navigate(to);
    },
    [markRead, navigate],
  );

  const footerTarget =
    role === "sales"
      ? { to: "/inventory", label: "Open inventory" }
      : { to: "/discrepancies", label: "Open discrepancies register" };

  const emptyHint =
    role === "management"
      ? "No tickets are waiting on a management decision."
      : role === "warehouse"
        ? "The count queue is clear and no ticket needs encoding."
        : "Availability at your branch looks healthy.";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={
          unreadCount > 0 ? `Notifications: ${unreadCount} unread` : "Notifications: none unread"
        }
        className={`relative w-8 h-8 flex items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open
            ? "border-blue-500 bg-blue-50"
            : "border-[#dee2e6] bg-white hover:bg-[#f8f9fa]"
        }`}
      >
        <Bell
          size={14}
          className={unreadCount > 0 ? "text-[#0d6efd]" : "text-[#6c757d]"}
          aria-hidden="true"
        />
        {unreadCount > 0 ? (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="notifications-panel"
          className="absolute right-0 top-full mt-2 w-[364px] max-w-[calc(100vw-2rem)] bg-white border border-[#dee2e6] rounded-lg shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[#dee2e6] bg-[#f8f9fa]">
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold text-[#1a1d23]">Notifications</h2>
              <p className="text-[11px] text-[#6c757d]">
                {unreadCount > 0
                  ? `${unreadCount} unread of ${notifications.length}`
                  : notifications.length > 0
                    ? `All ${notifications.length} read`
                    : "Nothing to show"}
              </p>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="shrink-0 text-[11px] text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1 py-0.5"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <CheckCircle2 size={22} className="mx-auto text-green-500 mb-2" aria-hidden="true" />
              <p className="text-[12px] font-medium text-[#495057]">Nothing needs your attention</p>
              <p className="text-[11px] text-[#6c757d] mt-1 leading-snug">{emptyHint}</p>
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {notifications.map((item) => {
                const unread = !readSet.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item.id, item.to)}
                      className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 border-b border-[#f0f2f5] last:border-b-0 hover:bg-[#f8f9fa] transition-colors focus-visible:outline-none focus-visible:bg-[#f0f7ff]"
                    >
                      <span
                        className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[item.tone]}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`text-[12px] truncate ${
                              unread ? "font-semibold text-[#1a1d23]" : "text-[#495057]"
                            }`}
                          >
                            {item.title}
                          </span>
                          {unread ? (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                              aria-label="unread"
                            />
                          ) : null}
                        </span>
                        <span className="block text-[12px] text-[#495057] truncate mt-0.5">
                          {item.detail}
                        </span>
                        <span className="block text-[11px] text-[#6c757d] truncate mt-0.5">
                          {item.meta}
                        </span>
                      </span>
                      <ChevronRight
                        size={13}
                        className="text-[#adb5bd] shrink-0 mt-1.5"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-3.5 py-2 border-t border-[#dee2e6] bg-[#f8f9fa]">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(footerTarget.to);
              }}
              className="text-[11px] font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1 py-0.5"
            >
              {footerTarget.label}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
