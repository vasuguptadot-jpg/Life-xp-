/**
 * STAGE 20 — Part 2: completion / mutation rate limiting (AG-2).
 *
 * A state-mutating request rate limiter keyed on the authenticated user
 * identity. The XP-awarding completion endpoints are already idempotent and
 * bounded (see AG-1), so a limiter is NOT required to prevent XP farming. It
 * exists to bound the *number of mutation attempts* a single authenticated
 * client can issue (row inflation via assign→abandon churn, generic flooding),
 * which no idempotency check can prevent.
 *
 * Rationale for the defaults: a legitimate power user completes ~5 daily tasks
 * and performs ~10 quest operations in a session — well under 120 mutations
 * per 10 minutes. A scripted client hammering the API is the only thing that
 * reaches the cap, so normal gameplay is never throttled.
 */
import rateLimit, { type Options } from "express-rate-limit";
import { logger } from "./logger";

export interface MutationLimiterEnv {
  windowMs: number;
  max: number;
}

export function readMutationLimiterEnv(): MutationLimiterEnv {
  return {
    windowMs: Number(process.env.MUTATION_RATE_LIMIT_WINDOW_MS ?? 600_000),
    max: Number(process.env.MUTATION_RATE_LIMIT_MAX ?? 120),
  };
}

export function makeMutationLimiter(overrides?: Partial<MutationLimiterEnv>): ReturnType<typeof rateLimit> {
  const { windowMs, max } = { ...readMutationLimiterEnv(), ...overrides };

  const config: Partial<Options> = {
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests — please slow down" },
    // Keyed strictly on the authenticated user identity (always present behind
    // requireAuth). A shared fallback bucket is intentionally conservative for
    // the impossible unauthenticated case.
    keyGenerator: (req) => {
      const uid = (req as unknown as { user?: { sub?: string } }).user?.sub;
      return uid ?? "unauthenticated";
    },
    // Rate-limit observability: emit a structured, safely-anonymized rejection
    // event so an operator can distinguish a rate-limit spike from other 4xx.
    // No user id / request identifier is logged — only the limiter category —
    // so the log can never be abused to enumerate accounts.
    handler: (req, res, _next, _options) => {
      logger.warn(
        {
          event: "rate_limit.rejected",
          category: "rate_limit",
          method: req.method,
          path: (req.originalUrl ?? req.path).split("?")[0],
        },
        "Rate limit exceeded",
      );
      res.status(429).json({ message: "Too many requests — please slow down" });
    },
  };

  return rateLimit(config);
}
