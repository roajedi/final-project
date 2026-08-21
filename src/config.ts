import dotenv from "dotenv";

dotenv.config();

function getPositiveInt(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function getNonNegativeInt(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

export const config = {
  port: getPositiveInt(process.env.PORT, 8080),

  dbUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@db:5432/logsdb",

  dbPoolMax: getPositiveInt(
    process.env.DB_POOL_MAX,
    20
  ),

  authEnabled:
    process.env.AUTH_ENABLED === "true",

  loadGenApiKey:
    process.env.LOADGEN_API_KEY ?? "",

  retentionDays: getNonNegativeInt(
    process.env.RETENTION_DAYS,
    90
  ),

  retentionIntervalMs: getPositiveInt(
    process.env.RETENTION_INTERVAL_MS,
    60_000
  ),

  retentionBatchSize: getPositiveInt(
    process.env.RETENTION_BATCH_SIZE,
    5_000
  ),
};