import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    return;
  }

  // A stateless JWT outlives account deletion (up to its 15-minute lifetime).
  // Verify the account still exists (and is active) so a deleted identity can
  // neither authenticate nor surface a foreign-key-violation 500 when it
  // attempts a mutation. (STAGE 24 finding D-2.)
  const [account] = await db
    .select({ id: usersTable.id, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.sub))
    .limit(1);

  if (!account || !account.isActive) {
    logger.info(
      {
        event: "auth.failed",
        category: "authentication",
        reason: "account_deleted_or_inactive",
        path: (req.originalUrl ?? req.path).split("?")[0],
      },
      "Authentication failed — account no longer exists",
    );
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  next();
}
