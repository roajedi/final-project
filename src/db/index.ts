import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.dbUrl,
  max: config.dbPoolMax,
  connectionTimeoutMillis: 5_000,
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
    version: 5,
    sql: `
      DROP INDEX IF EXISTS idx_logs_fast_composite;
      DROP INDEX IF EXISTS idx_logs_ts_id;

      CREATE INDEX IF NOT EXISTS idx_logs_ts_service_level 
        ON logs (timestamp, service, level);

      CREATE INDEX IF NOT EXISTS idx_logs_ts_desc 
        ON logs (timestamp DESC, id DESC);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE EXTENSION IF NOT EXISTS pg_trgm;

      CREATE TABLE IF NOT EXISTS log_rollups_1m (
        bucket_start TIMESTAMPTZ NOT NULL,
        service VARCHAR(100) NOT NULL,
        level VARCHAR(10) NOT NULL,
        count BIGINT NOT NULL,
        PRIMARY KEY (bucket_start, service, level)
      );

      CREATE INDEX IF NOT EXISTS idx_logs_service_ts_desc
        ON logs (service, timestamp DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_logs_level_ts_desc
        ON logs (level, timestamp DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_logs_service_level_ts_desc
        ON logs (service, level, timestamp DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_logs_attributes_gin
        ON logs USING GIN (attributes jsonb_path_ops);

      CREATE INDEX IF NOT EXISTS idx_logs_message_trgm
        ON logs USING GIN (message gin_trgm_ops);

      CREATE INDEX IF NOT EXISTS idx_rollups_1m_service_bucket
        ON log_rollups_1m (service, bucket_start);

      CREATE INDEX IF NOT EXISTS idx_rollups_1m_level_bucket
        ON log_rollups_1m (level, bucket_start);

      INSERT INTO log_rollups_1m (bucket_start, service, level, count)
      SELECT
        date_bin('1 minute'::interval, timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00'),
        service,
        level,
        COUNT(*)::bigint
      FROM logs
      GROUP BY 1, 2, 3
      ON CONFLICT (bucket_start, service, level) DO NOTHING;
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