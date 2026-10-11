import { useState } from "react";
import { NavLink } from "react-router";
import { ChevronDown, LogOut, Package } from "lucide-react";

import { navSectionsForRole } from "../../nav";
import { useAuth } from "../../auth/AuthProvider";
import { useSystemStore } from "../../store/SystemStore";
import { initials } from "../../lib/format";
import { ROLE_LABELS } from "../../../../shared/types";

/**
 * The sidebar is role-aware: the sections it renders come from
 * `navSectionsForRole`, so a sales officer never sees a link to a module the
 * database would refuse them anyway.
 */
export function AppSidebar() {
  const { profile, mode, signOut } = useAuth();
  const { company, branches } = useSystemStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const role = profile?.role ?? "sales";
  const sections = navSectionsForRole(role);
  const displayName = profile?.fullName ?? "Signed out";

  return (
    <aside className="flex flex-col w-64 shrink-0 h-full bg-[#1c2a3a] print:hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#243447]">
        <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center shrink-0">
          <Package size={15} className="text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-white text-sm font-semibold leading-tight truncate">
            {company.shortName}
          </div>
          <div className="text-[#6b7f94] text-[10px] leading-tight truncate">
            Reconciliation System
          </div>
        </div>
      </div>

      {mode === "demo" ? (
        <div className="mx-3 mt-3 rounded border border-[#4a6070] bg-[#243447] px-2.5 py-1.5">
          <div className="text-[10px] font-semibold text-[#ffd166] uppercase tracking-wide">
            Demo data
          </div>
          <div className="text-[10px] text-[#8fa3b4] leading-snug">
            Supabase not configured — showing the bundled dataset.
          </div>
        </div>
      ) : null}

      <nav aria-label="Main navigation" className="flex-1 py-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4 last:mb-0">
            <div className="px-4 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4a6070]">
                {section.heading}
              </span>
            </div>
            <ul className="space-y-0.5 px-2">
              {section.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded text-[13px] transition-colors duration-150 ${
                        isActive
                          ? "bg-blue-600 text-white font-medium"
                          : "text-[#8fa3b4] hover:bg-[#243447] hover:text-white"
                      }`
                    }
                  >
                    <Icon size={15} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="px-4 mt-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4a6070]">
            Branches ({branches.length})
          </span>
        </div>
        <ul className="space-y-0.5 px-2">
          {branches.map((branch) => (
            <li key={branch.id}>
              <NavLink
                to={`/inventory?branch=${branch.id}`}
                className="flex items-center gap-3 px-3 py-1.5 rounded text-[12px] text-[#8fa3b4] hover:bg-[#243447] hover:text-white transition-colors duration-150"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    branch.isMain ? "bg-blue-400" : "bg-green-500"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{branch.shortName}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-[#243447]">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-[#243447] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
            {initials(displayName)}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-white text-xs font-medium truncate">{displayName}</div>
            <div className="text-[#6b7f94] text-[10px] truncate">
              {profile ? ROLE_LABELS[role] : "Not signed in"}
              {profile?.branchId ? ` · ${profile.branchId.replace("BR-", "")}` : ""}
            </div>
          </div>
          <ChevronDown
            size={13}
            className={`text-[#4a6070] shrink-0 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {menuOpen ? (
          <div role="menu" className="px-3 pb-3">
            {profile?.email ? (
              <div className="px-2 py-1.5 text-[10px] text-[#6b7f94] truncate" title={profile.email}>
                {profile.email}
              </div>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="w-full flex items-center gap-2 px-2 py-2 rounded text-[12px] text-[#8fa3b4] hover:bg-[#243447] hover:text-white transition-colors"
            >
              <LogOut size={13} aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
