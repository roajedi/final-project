import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.dbUrl,
  max: 15,
  connectionTimeoutMillis: 3_000,
  idleTimeoutMillis: 30_000,
});

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS logs (
        id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        level VARCHAR(10) NOT NULL,
        service VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    version: 4,
    sql: `
      DROP INDEX IF EXISTS idx_logs_msg_trgm;
      DROP INDEX IF EXISTS idx_logs_json_attr;
      DROP INDEX IF EXISTS idx_logs_perf_composite;
      DROP INDEX IF EXISTS idx_logs_pagination;
      DROP INDEX IF EXISTS idx_logs_query_perf;
      DROP INDEX IF EXISTS idx_logs_ts_id;
      DROP INDEX IF EXISTS idx_logs_service_ts;
      DROP INDEX IF EXISTS idx_logs_level_ts;

      ALTER TABLE logs SET (autovacuum_enabled = false);

      CREATE INDEX IF NOT EXISTS idx_logs_fast_composite 
        ON logs (timestamp DESC, service, level);

      CREATE INDEX IF NOT EXISTS idx_logs_ts_id 
        ON logs (timestamp DESC, id DESC);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      const result = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [migration.version]
      );

      if (result.rowCount === 0) {
        await client.query(migration.sql);

        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [migration.version]
        );

        console.log(`Applied migration ${migration.version}`);
      }
    }

    if (config.authEnabled && config.loadGenApiKey) {
      await client.query(
        `
        INSERT INTO api_keys (key)
        VALUES ($1)
        ON CONFLICT (key) DO NOTHING
        `,
        [config.loadGenApiKey]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}