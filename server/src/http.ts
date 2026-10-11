import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An error carrying the HTTP status the client should receive. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required.") {
    return new HttpError(401, "unauthorized", message);
  }
  static forbidden(message = "Your role does not permit this action.") {
    return new HttpError(403, "forbidden", message);
  }
  static notFound(message = "Not found.") {
    return new HttpError(404, "not_found", message);
  }
  static conflict(message: string) {
    return new HttpError(409, "conflict", message);
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Reads a route parameter, failing with a 400 rather than passing undefined on. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw HttpError.badRequest(`Missing route parameter "${name}".`);
  return value;
}

/** Reads an optional string query parameter. */
export function queryString(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Translates a Supabase/PostgREST error into an HttpError.
 *
 * The interesting case is 42501 — Postgres' insufficient_privilege, which is
 * what a Row Level Security policy raises when a role attempts something it is
 * not allowed to do. Surfacing that as a 403 with a readable message is what
 * lets the UI explain *why* an action was refused.
 */
export function fromSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string | null;
}): HttpError {
  const code = error.code ?? "";
  const message = error.message ?? "Database request failed.";

  if (code === "42501") {
    return new HttpError(403, "forbidden", message);
  }
  if (code === "PGRST116") {
    return HttpError.notFound("No rows matched the request.");
  }
  if (code === "23505") {
    return HttpError.conflict(message);
  }
  if (code === "23514" || code === "23503") {
    return HttpError.badRequest(message);
  }
  return new HttpError(500, "database_error", message);
}
