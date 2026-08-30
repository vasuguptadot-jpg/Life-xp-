import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
// Must have 4 parameters so Express recognises it as an error handler.
// Catches all unhandled route errors, logs them safely, and returns a
// structured JSON error — never leaking raw DB/stack details to clients.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const safeErr = err instanceof Error ? err : new Error(String(err));

  // pino-http attaches req.log; fall back to the module logger
  const log = (req as Request & { log?: typeof logger }).log ?? logger;
  log.error({ err: safeErr }, "Unhandled request error");

  if (res.headersSent) {
    return;
  }

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

  res
    .status(status)
    .json({ message: status >= 500 ? "Internal server error" : "Invalid request" });
});

export default app;
