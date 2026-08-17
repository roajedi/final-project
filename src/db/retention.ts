import { pool } from "./index.js";
import { config } from "../config.js";

export async function deleteExpiredLogs(): Promise<number> {
  let totalDeleted = 0;

  for (let i = 0; i < 10; i++) {
    const isZeroDays = config.retentionDays === 0;

    const query = `
      WITH expired AS (
        SELECT id
        FROM logs
        WHERE timestamp <= ${isZeroDays ? 'NOW()' : "NOW() - ($1::int * INTERVAL '1 day')"}
        ORDER BY timestamp ASC, id ASC
        LIMIT ${isZeroDays ? '$1' : '$2'}
      )
      DELETE FROM logs
      WHERE id IN (SELECT id FROM expired)
    `;

    const params = isZeroDays
      ? [config.retentionBatchSize]
      : [config.retentionDays, config.retentionBatchSize];

    const result = await pool.query(query, params);

    const deleted = result.rowCount ?? 0;

    totalDeleted += deleted;

    if (deleted < config.retentionBatchSize) {
      break;
    }
  }

  if (totalDeleted > 0) {
    console.log(
      `Retention deleted ${totalDeleted} expired logs`
    );
  }

  return totalDeleted;
}

export function startRetentionJob(): NodeJS.Timeout {
  const run = async () => {
    try {
      await deleteExpiredLogs();
    } catch (error) {
      console.error("Retention job failed:", error);
    }
  };

  void run();

  return setInterval(
    () => void run(),
    config.retentionIntervalMs
  );
}