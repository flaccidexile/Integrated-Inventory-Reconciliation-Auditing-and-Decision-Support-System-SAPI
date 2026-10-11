/**
 * The dead-stock matching engine lives in `shared/matchmaker.ts` so the Express
 * API and this client's offline demo mode share one implementation.
 * Re-exported here to keep existing imports working.
 */
export * from "../../../shared/matchmaker";
export type { MatchSummary } from "../../../shared/types";
