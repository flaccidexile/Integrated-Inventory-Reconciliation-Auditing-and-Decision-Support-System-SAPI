import { Router } from "express";

import { analyticsRouter } from "./analytics";
import { cycleTasksRouter } from "./cycleTasks";
import { discrepanciesRouter } from "./discrepancies";
import { matchmakerRouter } from "./matchmaker";
import { metaRouter } from "./meta";
import { purchaseOrdersRouter } from "./purchaseOrders";
import { stockRouter } from "./stock";
import { transfersRouter } from "./transfers";

/**
 * The API surface, mounted under /api.
 *
 *   meta            /api/health, /api/me, /api/bootstrap, /api/branches, ...
 *   stock           /api/stock
 *   cycle-tasks     /api/cycle-tasks            Objective 1
 *   discrepancies   /api/discrepancies          Objective 2
 *   analytics       /api/analytics              Objective 3
 *   matchmaker      /api/matchmaker             Objective 4
 *   transfers       /api/transfers
 *   purchase-orders /api/purchase-orders
 *
 * Each router applies `requireAuth` itself so the unauthenticated surface is
 * exactly `/api/health` and nothing else.
 */
export const apiRouter = Router();

apiRouter.use("/", metaRouter);
apiRouter.use("/stock", stockRouter);
apiRouter.use("/cycle-tasks", cycleTasksRouter);
apiRouter.use("/discrepancies", discrepanciesRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/matchmaker", matchmakerRouter);
apiRouter.use("/transfers", transfersRouter);
apiRouter.use("/purchase-orders", purchaseOrdersRouter);
