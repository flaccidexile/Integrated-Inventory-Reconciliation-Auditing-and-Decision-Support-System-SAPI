import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { AlertCircle, Loader2, Lock, Mail, Package, ShieldCheck, Truck, Users } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { isSupabaseConfigured } from "../lib/supabase";
import { DEMO_ACCOUNTS, DEFAULT_DEMO_PASSWORD } from "../data/users";
import { COMPANY } from "../data/company";
import { landingRouteFor } from "../../../shared/permissions";
import { ROLE_BLURBS, ROLE_LABELS, type UserRole } from "../../../shared/types";

/**
 * Sign-in screen.
 *
 * The three roles are not just a label in this system — they change which
 * modules exist for the user — so the form states plainly what each one is for
 * and offers a one-click fill for the seeded demo accounts, which is what makes
 * a live defence demonstration practical.
 */

const ROLE_ICON: Record<UserRole, typeof Users> = {
  management: ShieldCheck,
  warehouse: Package,
  sales: Truck,
};

export function LoginPage() {
  const { status, profile, error: authError, signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated: go straight to the landing route for the role.
  useEffect(() => {
    if ((status === "signed-in" || status === "demo") && profile) {
      navigate(landingRouteFor(profile.role), { replace: true });
    }
  }, [status, profile, navigate]);

  if ((status === "signed-in" || status === "demo") && profile) {
    return <Navigate to={landingRouteFor(profile.role)} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f0f2f5]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Brand panel */}
      <div className="hidden lg:flex w-[42%] bg-[#1c2a3a] flex-col justify-between p-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center">
            <Package size={18} className="text-white" aria-hidden="true" />
          </div>
          <div>
            <div className="text-white text-[15px] font-semibold leading-tight">{COMPANY.shortName}</div>
            <div className="text-[#6b7f94] text-[11px] leading-tight">{COMPANY.abbr}</div>
          </div>
        </div>

        <div>
          <h1 className="text-white text-[22px] font-semibold leading-snug mb-3">
            Inventory Reconciliation, Auditing &amp; Decision Support
          </h1>
          <p className="text-[#8fa3b4] text-[13px] leading-relaxed mb-8">
            Targeted cycle counting, a locked discrepancy approval workflow, discrepancy analytics and
            automated dead-stock matching — across all {COMPANY.branchCount} branches.
          </p>

          <ul className="space-y-4">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => {
              const Icon = ROLE_ICON[role];
              return (
                <li key={role} className="flex gap-3">
                  <Icon size={16} className="text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-white text-[12px] font-medium">{ROLE_LABELS[role]}</div>
                    <div className="text-[#8fa3b4] text-[11px] leading-snug">{ROLE_BLURBS[role]}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-[#4a6070] text-[11px]">
          Quezon City University · BSIS Capstone · {COMPANY.website}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center">
              <Package size={15} className="text-white" aria-hidden="true" />
            </div>
            <span className="text-[14px] font-semibold text-[#1a1d23]">{COMPANY.shortName}</span>
          </div>

          <h2 className="text-[18px] font-semibold text-[#1a1d23] mb-1">Sign in</h2>
          <p className="text-[12px] text-[#6c757d] mb-6">
            Use your Southwind staff account. Your role decides which modules you can open.
          </p>

          {!isSupabaseConfigured ? (
            <div className="mb-5 flex gap-2.5 rounded border border-[#ffe69c] bg-[#fff9e6] px-3 py-2.5">
              <AlertCircle size={15} className="text-[#cc9a06] mt-0.5 shrink-0" aria-hidden="true" />
              <div className="text-[11px] text-[#7a5c00] leading-relaxed">
                <span className="font-semibold">Demo mode.</span> Supabase is not configured, so the app
                is running on the bundled dataset as a management user. Add{" "}
                <code className="font-mono">VITE_SUPABASE_URL</code> and{" "}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to enable real sign-in.
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-[12px] font-medium text-[#495057] mb-1">
                Work email
              </label>
              <div className="flex items-center gap-2 rounded border border-[#dee2e6] bg-white px-3 h-10 focus-within:ring-2 focus-within:ring-blue-500">
                <Mail size={14} className="text-[#adb5bd] shrink-0" aria-hidden="true" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={!isSupabaseConfigured || submitting}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="manager@southwind.com.ph"
                  className="flex-1 min-w-0 bg-transparent text-[13px] text-[#495057] placeholder-[#adb5bd] outline-none disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[12px] font-medium text-[#495057] mb-1">
                Password
              </label>
              <div className="flex items-center gap-2 rounded border border-[#dee2e6] bg-white px-3 h-10 focus-within:ring-2 focus-within:ring-blue-500">
                <Lock size={14} className="text-[#adb5bd] shrink-0" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={!isSupabaseConfigured || submitting}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="flex-1 min-w-0 bg-transparent text-[13px] text-[#495057] placeholder-[#adb5bd] outline-none disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {error || authError ? (
              <div
                role="alert"
                className="flex gap-2 rounded border border-[#f5c2c7] bg-[#f8d7da] px-3 py-2 text-[11px] text-[#842029]"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error || authError}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!isSupabaseConfigured || submitting}
              className="w-full h-10 rounded bg-[#0d6efd] text-white text-[13px] font-medium hover:bg-[#0b5ed7] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#dee2e6]">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#adb5bd] mb-2.5">
              Demo accounts
            </div>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={!isSupabaseConfigured || submitting}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEFAULT_DEMO_PASSWORD);
                    setError(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded border border-[#dee2e6] bg-white px-3 py-2 text-left hover:border-[#0d6efd] hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-[#1a1d23] truncate">
                      {ROLE_LABELS[account.role]}
                    </span>
                    <span className="block text-[11px] text-[#6c757d] truncate">{account.email}</span>
                  </span>
                  <span className="text-[10px] text-[#0d6efd] font-medium shrink-0">Use</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#adb5bd] mt-2.5 leading-relaxed">
              Default password for seeded accounts:{" "}
              <code className="font-mono text-[#6c757d]">{DEFAULT_DEMO_PASSWORD}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
