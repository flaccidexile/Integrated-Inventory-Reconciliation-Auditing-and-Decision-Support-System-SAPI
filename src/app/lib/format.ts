import type { CSSProperties } from "react";

/** Monospace style used for SKUs, quantities and money in tables. */
export const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };

export function num(value: number): string {
  return Math.round(value).toLocaleString("en-PH");
}

export function peso(value: number): string {
  return `₱${num(value)}`;
}

/** Compact peso for chart axes and KPI tiles (₱1.2M, ₱845K). */
export function pesoCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₱${Math.round(value / 1_000)}K`;
  return peso(value);
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${num(value)}`;
}

export function signedPeso(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${peso(Math.abs(value))}`;
}

/** "Sep 6, 2026" — the single date format used throughout the system. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
