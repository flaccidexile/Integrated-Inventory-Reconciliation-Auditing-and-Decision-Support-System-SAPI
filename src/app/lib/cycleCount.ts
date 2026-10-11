/**
 * The cycle-count scoring engine lives in `shared/cycleCount.ts` so the Express
 * API that generates the live queue and this client's offline demo mode run the
 * exact same rule. Re-exported here to keep existing imports working.
 */
export * from "../../../shared/cycleCount";
export type { CycleSummary } from "../../../shared/types";
