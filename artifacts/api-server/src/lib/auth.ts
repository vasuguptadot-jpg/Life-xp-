import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("SESSION_SECRET env var is required");

export interface JwtPayload {
  sub: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload, expiresIn = "1d"): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET!) as JwtPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logger.info(
      {
        event: "auth.failed",
        category: "authentication",
        reason: "missing_bearer_header",
        path: (req.originalUrl ?? req.path).split("?")[0],
      },
      "Authentication failed — no bearer token",
    );
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    logger.info(
      {
        event: "auth.failed",
        category: "authentication",
        reason: "invalid_or_expired_token",
        path: (req.originalUrl ?? req.path).split("?")[0],
      },
      "Authentication failed — invalid or expired token",
    );
    res.status(401).json({ message: "Invalid or expired token" });
  }
}
