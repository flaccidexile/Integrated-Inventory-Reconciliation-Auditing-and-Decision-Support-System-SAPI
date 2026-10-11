import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

/**
 * The Express tier of the PERN stack.
 *
 * Postgres and authentication are Supabase's; this server is the only place
 * that holds the service-role key, and it is the only thing the React client
 * talks to. The browser never sees a database credential beyond the public
 * anon key it uses for sign-in.
 *
 * Authorization is layered:
 *   1. `requireAuth` proves who the caller is (Supabase JWT -> profiles row).
 *   2. `requireRole` gives a friendly 403 for the few role-gated routes.
 *   3. Row Level Security — the real boundary — decides what the query may touch.
 */

const app = express();

// Behind a proxy (Render, Fly, nginx) so rate limiting and logs see real IPs.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/tooling requests (curl, health checks) arrive with no Origin.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin) || env.corsOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

// A one-line request log. Enough to see what the client is doing without
// pulling in a logging framework.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (req.path === "/api/health") return;
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`,
    );
  });
  next();
});

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log("");
  console.log("  SAPI API — Inventory Reconciliation, Auditing & Decision Support");
  console.log(`  listening        http://localhost:${env.port}`);
  console.log(`  supabase         ${env.supabaseUrl}`);
  console.log(`  allowed origins  ${env.corsOrigins.join(", ")}`);
  console.log(`  dataset as of    ${env.asOf}`);
  console.log("");
  console.log("  Try:  curl http://localhost:" + env.port + "/api/health");
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n[sapi] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
  });
}
