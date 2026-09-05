import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { classifyError, classifyHttpStatus, requestContext } from "./lib/observability";

const app: Express = express();

// Replit's proxy sets X-Forwarded-For; trust it so rate-limiting works correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── Request correlation ───────────────────────────────────────────────────────
// pino-http assigns each request a unique `req.id`. Echo it back as a response
// header so an operator (or a support ticket) can correlate client-visible
// failures with server logs. The id is a random value — never sensitive.
app.use((req, res, next) => {
  if (typeof req.id === "string" || typeof req.id === "number") {
    res.setHeader("X-Request-Id", String(req.id));
  }
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
// In development: allow all origins.
// In production: restrict to the CORS_ORIGINS env var (comma-separated list).
const rawOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin requests (no Origin header) and development mode
      if (!origin || process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      if (rawOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Strip NUL bytes (U+0000) from parsed bodies. PostgreSQL text columns reject
// U+0000 with "invalid byte sequence for encoding UTF8", which would otherwise
// surface as an unhandled 500 for any free-text field. Removing them is safe —
// they carry no meaning in JSON strings.
//
// The traversal is iterative (explicit stack) rather than recursive: a deeply
// nested JSON body (e.g. ~5k levels) previously overflowed the call stack with
// `RangeError: Maximum call stack size exceeded`, surfacing as an unhandled 500.
function stripNullBytes(value: unknown): unknown {
  type Frame = { value: unknown; key?: string; parent?: Record<string, unknown> };
  const stack: Frame[] = [{ value }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    const v = frame.value;
    if (typeof v === "string") {
      if (frame.parent && frame.key !== undefined) {
        frame.parent[frame.key] = v.replace(/\u0000/g, "");
      }
      continue;
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const child = v[i];
        if (typeof child === "string" || (child && typeof child === "object")) {
          stack.push({ value: child, key: String(i), parent: v as unknown as Record<string, unknown> });
        }
      }
    } else if (v && typeof v === "object") {
      const rec = v as Record<string, unknown>;
      for (const [k, child] of Object.entries(rec)) {
        if (typeof child === "string" || (child && typeof child === "object")) {
          stack.push({ value: child, key: k, parent: rec });
        }
      }
    }
  }
  return value;
}
app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = stripNullBytes(req.body) as typeof req.body;
  }
  next();
});

app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
// Must have 4 parameters so Express recognises it as an error handler.
// Catches all unhandled route errors, logs them safely WITH a consistent error
// taxonomy and request correlation, and returns a structured JSON error — never
// leaking raw DB/stack/external-service details to clients.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const safeErr = err instanceof Error ? err : new Error(String(err));

  // pino-http attaches req.log; fall back to the module logger
  const log = (req as Request & { log?: typeof logger }).log ?? logger;

  // Respect client-error status codes (e.g. body-parser sets status 400 for
  // malformed JSON), otherwise fall back to a generic 500.
  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 500
      ? (err as { status: number }).status
      : 500;

  const { category, isClientError } = classifyHttpStatus(status);
  const errorCategory = category === "internal" ? classifyError(safeErr) : category;

  // Expected client errors (4xx) are NOT server incidents: log at warn, not
  // error/fatal. Genuine internal failures are logged at error so they are
  // alertable. Both carry a taxonomy category + correlation context.
  const event = {
    event: "request.error",
    category: errorCategory,
    status,
    ...requestContext(req),
    err: safeErr,
  };
  if (isClientError && status < 500) {
    log.warn(event, "Client error");
  } else {
    log.error(event, "Unhandled request error");
  }

  if (res.headersSent) {
    return;
  }

  res
    .status(status)
    .json({ message: status >= 500 ? "Internal server error" : "Invalid request" });
});

export default app;
