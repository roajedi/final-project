import cluster from "node:cluster";
import process from "node:process";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";

import { config } from "./config.js";
import { pool, runMigrations } from "./db/index.js";
import { insertLogs, queryLogs } from "./db/logs.js";
import { aggregateLogs } from "./db/aggregate.js";
import { startRetentionJob } from "./db/retention.js";
import { requireAuth } from "./middleware/auth.js";

import {
  validateLog,
  validateLogsBody,
  type LogItem,
  type RejectedLog,
} from "./validation/log.validation.js";

import {
  parseAggregateQuery,
  parseLogsQuery,
} from "./validation/query.validation.js";

const app = express();

app.use(express.json({ limit: "10mb" }));

app.get(
  "/health",
  async (_req: Request, res: Response) => {
    try {
      await pool.query("SELECT 1");

      res.status(200).json({
        status: "ok",
      });
    } catch {
      res.status(503).json({
        status: "error",
        message: "Service not ready",
      });
    }
  }
);

app.post(
  "/logs",
  requireAuth,
  async (req: Request, res: Response) => {
    const bodyValidation = validateLogsBody(req.body);

    if (!bodyValidation.valid) {
      res.status(400).json({
        error: bodyValidation.reason,
      });
      return;
    }

    const accepted: LogItem[] = [];
    const rejected: RejectedLog[] = [];

    bodyValidation.logs.forEach((rawLog, index) => {
      const validation = validateLog(rawLog);

      if (validation.valid) {
        accepted.push(validation.value);
      } else {
        rejected.push({
          index,
          reason: validation.reason,
        });
      }
    });

    if (accepted.length === 0) {
      res.status(400).json({
        accepted: 0,
        rejected,
      });
      return;
    }

    try {
      const insertedCount = await insertLogs(accepted);

      res.status(200).json({
        accepted: insertedCount,
        rejected,
      });
    } catch (error) {
      console.error(
        "Failed to insert logs:",
        error
      );

      res.status(500).json({
        error: "Internal Server Error",
      });
    }
  }
);

app.get(
  "/logs",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const params = parseLogsQuery(req.query);

      const result = await queryLogs(params);

      res.status(200).json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid query parameters";

      res.status(400).json({
        error: message,
      });
    }
  }
);

app.get(
  "/logs/aggregate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const params = parseAggregateQuery(req.query);

      const result = await aggregateLogs(params);

      res.status(200).json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid query parameters";

      res.status(400).json({
        error: message,
      });
    }
  }
);

const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (
    error instanceof SyntaxError &&
    "body" in error
  ) {
    res.status(400).json({
      error: "Malformed JSON",
    });
    return;
  }

  next(error);
};

app.use(errorHandler);

async function startServer() {
  const numWorkers = 2;

  if (cluster.isPrimary) {
    try {
      await runMigrations();
      await pool.query("SELECT 1");

      console.log("Database connected and migrations applied.");

      for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
      }

      cluster.on("exit", () => {
        cluster.fork();
      });
    } catch (error) {
      console.error("Failed to start primary process:", error);
      await pool.end();
      process.exit(1);
    }
  } else {
    try {
      const server = app.listen(config.port, "0.0.0.0", () => {
        console.log(`Worker ${process.pid} running on port ${config.port}`);
      });

      startRetentionJob();

      const shutdown = async () => {
        server.close(async () => {
          await pool.end();
          process.exit(0);
        });
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    } catch (error) {
      console.error("Worker failed to start:", error);
      await pool.end();
      process.exit(1);
    }
  }
}

void startServer();