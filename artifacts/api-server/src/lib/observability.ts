/**
 * STAGE 22 — Production observability primitives.
 *
 * A single, shared, testable module for:
 *   1. Error taxonomy  — a consistent classification for every failure mode.
 *   2. Request context  — the fields an operator needs to correlate any event
 *                         with the originating request and user.
 *
 * This extends the existing pino/pino-http framework; it does NOT introduce a
 * second logging system.
 */

/** Severity levels, mirroring pino's level names. */
export type Severity = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Consistent error taxonomy. Every failure should map to exactly one category
 * so incidents can be bucketed and alerted on by machine.
 */
export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "database"
  | "transaction"
  | "external_service"
  | "timeout"
  | "internal";

/** HTTP status → category + whether it is an *expected client* error. */
export function classifyHttpStatus(status: number): {
  category: ErrorCategory;
  isClientError: boolean;
} {
  if (status >= 500) return { category: "internal", isClientError: false };
  switch (status) {
    case 400:
    case 422:
      return { category: "validation", isClientError: true };
    case 401:
      return { category: "authentication", isClientError: true };
    case 403:
      return { category: "authorization", isClientError: true };
    case 404:
      return { category: "not_found", isClientError: true };
    case 409:
      return { category: "conflict", isClientError: true };
    case 429:
      return { category: "rate_limit", isClientError: true };
    case 408:
    case 504:
      return { category: "timeout", isClientError: status === 408 };
    default:
      return { category: "internal", isClientError: false };
  }
}

/** PostgreSQL error code → category. */
const PG_ERROR_CATEGORIES: Record<string, ErrorCategory> = {
  "23505": "conflict", // unique_violation
  "23503": "conflict", // foreign_key_violation
  "23502": "validation", // not_null_violation
  "22P02": "validation", // invalid_text_representation
  "40001": "transaction", // serialization_failure
  "40P01": "transaction", // deadlock_detected
  "57014": "timeout", // query_canceled (statement timeout)
  "57P01": "database", // admin_shutdown
  "57P02": "database", // crash_shutdown
  "57P03": "database", // cannot_connect_now
  "08000": "database", // connection_exception
  "08003": "database", // connection_does_not_exist
  "08006": "database", // connection_failure
  "53300": "database", // too_many_connections
};

/**
 * Classify an unknown thrown value into an {@link ErrorCategory}, walking the
 * cause chain. Falls back to "internal" when the error carries no recognizable
 * signal.
 */
export function classifyError(err: unknown): ErrorCategory {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    const e = cur as {
      code?: string;
      name?: string;
      message?: string;
      status?: number;
      statusCode?: number;
      cause?: unknown;
    };

    // PostgreSQL errors expose a 5-char SQLSTATE in `code`.
    if (e.code && PG_ERROR_CATEGORIES[e.code]) return PG_ERROR_CATEGORIES[e.code];

    // express/body-parser style status codes.
    if (typeof e.statusCode === "number") return classifyHttpStatus(e.statusCode).category;
    if (typeof e.status === "number") return classifyHttpStatus(e.status).category;

    // Named error hints.
    if (e.name === "TimeoutError" || /timed? ?out/i.test(e.message ?? "")) return "timeout";
    if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(e.message ?? "")) {
      return "external_service";
    }
    if (/deadlock|serialization/i.test(e.message ?? "")) return "transaction";

    cur = e.cause;
  }
  return "internal";
}

/**
 * Minimal request context for correlation. Only ever includes non-sensitive
 * fields — never headers, tokens, cookies, or bodies.
 */
export interface RequestContext {
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
}

export function requestContext(req: {
  id?: unknown;
  user?: { sub?: string };
  method?: string;
  originalUrl?: string;
  path?: string;
}): RequestContext {
  return {
    requestId: typeof req.id === "string" || typeof req.id === "number" ? String(req.id) : undefined,
    userId: req.user?.sub,
    method: req.method,
    path: req.originalUrl?.split("?")[0] ?? req.path,
  };
}
