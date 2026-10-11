import { useLocation } from "react-router";
import { Search } from "lucide-react";

import { navItemForPath } from "../../nav";
import { useSystemStore } from "../../store/SystemStore";
import { shortDate } from "../../lib/format";
import { NotificationsMenu } from "./NotificationsMenu";

export function AppHeader() {
  const { pathname } = useLocation();
  const current = navItemForPath(pathname);
  const { asOf } = useSystemStore();

  return (
    <header className="flex items-center justify-between gap-4 h-14 px-6 bg-white border-b border-[#dee2e6] shrink-0 print:hidden">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold text-[#1a1d23] truncate">{current.label}</h1>
        <p className="text-[11px] text-[#6c757d] truncate">{current.subtitle}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:flex items-center gap-2 bg-[#f8f9fa] border border-[#dee2e6] rounded px-3 h-8 w-56">
          <Search size={13} className="text-[#adb5bd]" aria-hidden="true" />
          <label htmlFor="global-search" className="sr-only">
            Search SKU or part name
          </label>
          <input
            id="global-search"
            type="search"
            className="bg-transparent text-[13px] text-[#495057] placeholder-[#adb5bd] outline-none flex-1 min-w-0"
            placeholder="Search SKU or part name…"
          />
        </div>

        <NotificationsMenu />

        <div className="hidden sm:flex text-[11px] text-[#6c757d] bg-[#f8f9fa] border border-[#dee2e6] rounded px-2.5 h-8 items-center">
          {shortDate(asOf)}
        </div>
      </div>
    </header>
  );
}
