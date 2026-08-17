import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { config } from "../config.js";
import { pool } from "../db/index.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.authEnabled) {
    next();
    return;
  }

  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    res.status(401).json({
      error: "Missing or malformed bearer token",
    });
    return;
  }

  const key = authorization
    .slice("Bearer ".length)
    .trim();

  if (!key) {
    res.status(401).json({
      error: "Missing or malformed bearer token",
    });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT key FROM api_keys WHERE key = $1",
      [key]
    );

    if (result.rowCount === 0) {
      res.status(401).json({
        error: "Invalid API key",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}