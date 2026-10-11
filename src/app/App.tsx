import { Suspense, lazy } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth, RequireRole } from "./auth/RequireAuth";
import { SystemStoreProvider } from "./store/SystemStore";
import { AppSidebar } from "./components/layout/AppSidebar";
import { AppHeader } from "./components/layout/AppHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginPage } from "./pages/LoginPage";
import { ALL_NAV_ITEMS } from "./nav";
import type { RouteKey } from "../../shared/permissions";

/**
 * Application shell for the Southwind Automotive Parts Inc.
 * Inventory Reconciliation, Auditing & Decision Support System.
 *
 * Provider order matters: `AuthProvider` establishes who the user is, then
 * `SystemStoreProvider` fetches the data that user is allowed to see. Every
 * protected route is wrapped in `RequireAuth` (is there a session?) and
 * `RequireRole` (does this role own this module?), both driven by the single
 * permission matrix in shared/permissions.ts.
 *
 * Pages are code-split so the charting library only loads on the two routes
 * that actually render charts.
 */

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const CycleCountPage = lazy(() =>
  import("./pages/CycleCountPage").then((m) => ({ default: m.CycleCountPage })),
);
const DiscrepanciesPage = lazy(() =>
  import("./pages/DiscrepanciesPage").then((m) => ({ default: m.DiscrepanciesPage })),
);
const MatchmakerPage = lazy(() =>
  import("./pages/MatchmakerPage").then((m) => ({ default: m.MatchmakerPage })),
);
const InventoryPage = lazy(() =>
  import("./pages/InventoryPage").then((m) => ({ default: m.InventoryPage })),
);
const TransfersPage = lazy(() =>
  import("./pages/TransfersPage").then((m) => ({ default: m.TransfersPage })),
);
const PurchaseOrdersPage = lazy(() =>
  import("./pages/PurchaseOrdersPage").then((m) => ({ default: m.PurchaseOrdersPage })),
);
const SuppliersPage = lazy(() =>
  import("./pages/SuppliersPage").then((m) => ({ default: m.SuppliersPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

/** Route key -> element, so the guard wiring stays declarative. */
const PROTECTED_ROUTES: Array<{ key: RouteKey; path: string; element: React.ReactNode }> = [
  { key: "dashboard", path: "/", element: <DashboardPage /> },
  { key: "analytics", path: "/analytics", element: <AnalyticsPage /> },
  { key: "cycleCounts", path: "/cycle-counts", element: <CycleCountPage /> },
  { key: "discrepancies", path: "/discrepancies", element: <DiscrepanciesPage /> },
  { key: "matchmaker", path: "/matchmaker", element: <MatchmakerPage /> },
  { key: "inventory", path: "/inventory", element: <InventoryPage /> },
  { key: "transfers", path: "/transfers", element: <TransfersPage /> },
  { key: "purchaseOrders", path: "/purchase-orders", element: <PurchaseOrdersPage /> },
  { key: "suppliers", path: "/suppliers", element: <SuppliersPage /> },
  { key: "settings", path: "/settings", element: <SettingsPage /> },
];

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
      <span className="text-[12px] text-[#6c757d]">Loading module…</span>
    </div>
  );
}

/** The authenticated shell: sidebar, header, routed content. */
function AppShell() {
  const location = useLocation();
  const active = ALL_NAV_ITEMS.find((item) => item.to === location.pathname);

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <AppSidebar />

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f0f2f5] print:overflow-visible print:bg-white">
        <AppHeader />

        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-6 py-5 print:overflow-visible print:p-0"
        >
          {/*
            Scoped to the routed content, so a failing module leaves the sidebar
            and header intact and the user can navigate away. The boundary is
            keyed on the path so moving to another module clears the error.
          */}
          <ErrorBoundary resetKey={location.pathname} label={active?.label}>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {PROTECTED_ROUTES.map(({ key, path, element }) => (
                  <Route key={key} path={path} element={<RequireRole route={key}>{element}</RequireRole>} />
                ))}
                {/* Unknown paths fall back to the first module this role can see. */}
                <Route path="*" element={<Navigate to={ALL_NAV_ITEMS[0]?.to ?? "/"} replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:px-3 focus:py-2 focus:rounded focus:text-[13px]"
        >
          Skip to content
        </a>

        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <RequireAuth>
                <SystemStoreProvider>
                  <AppShell />
                </SystemStoreProvider>
              </RequireAuth>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
