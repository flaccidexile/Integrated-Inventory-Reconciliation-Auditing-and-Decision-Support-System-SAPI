/**
 * The domain model now lives in `shared/types.ts` so the Express API and the
 * React client compile against one definition. This file simply re-exports it,
 * which keeps every existing `import ... from "../types"` working untouched.
 */
export * from "../../shared/types";
