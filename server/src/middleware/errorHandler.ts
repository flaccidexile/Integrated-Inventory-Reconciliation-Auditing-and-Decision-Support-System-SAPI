import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../http";
import { env } from "../env";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `No API route matches ${req.method} ${req.path}.`,
  });
};

/**
 * Terminal error handler. Anything that is not an HttpError is treated as a
 * bug: it is logged in full and reported to the client as a generic 500, so
 * internal details never leak in production.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Postgres errors raised by RLS surface as { code: '42501', message: ... }.
  const maybePg = err as { code?: string; message?: string; details?: string | null };
  if (maybePg && typeof maybePg.code === "string" && /^[0-9A-Z]{5}$/.test(maybePg.code)) {
    const status = maybePg.code === "42501" ? 403 : 400;
    res.status(status).json({
      error: status === 403 ? "forbidden" : "database_error",
      message: maybePg.message ?? "The database rejected this request.",
      ...(maybePg.details ? { details: maybePg.details } : {}),
    });
    return;
  }

  console.error("[sapi] unhandled error:", err);
  res.status(500).json({
    error: "internal_error",
    message: "Something went wrong handling that request.",
    ...(env.isProduction ? {} : { debug: (err as Error)?.message }),
  });
};
