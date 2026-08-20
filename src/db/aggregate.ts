import { pool } from "./index.js";

interface AggregateParams {
  since: string;
  until: string;
  bucket: "1m" | "5m" | "1h" | "1d";
  groupBy?: "service" | "level";
  service?: string;
  level?: string;
  q?: string;
  attributes: Array<{
    key: string;
    value: string;
  }>;
}

const BUCKET_INTERVALS = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "1 day",
} as const;

export async function aggregateLogs(params: AggregateParams) {
  const values: unknown[] = [params.since, params.until];
  const conditions: string[] = [
    `timestamp >= $1::timestamptz`,
    `timestamp < $2::timestamptz`,
  ];

  if (params.service !== undefined) {
    values.push(params.service);
    conditions.push(`service = $${values.length}`);
  }

  if (params.level !== undefined) {
    values.push(params.level);
    conditions.push(`level = $${values.length}`);
  }

  if (params.q !== undefined) {
    values.push(`%${params.q}%`);
    conditions.push(`message LIKE $${values.length}`);
  }

  for (const attribute of params.attributes) {
    values.push(JSON.stringify({ [attribute.key]: attribute.value }));
    conditions.push(`attributes @> $${values.length}::jsonb`);
  }

  const groupCol =
    params.groupBy === "service"
      ? "service"
      : params.groupBy === "level"
      ? "level"
      : null;

  const groupSelect = groupCol ? groupCol : "NULL";
  const interval = BUCKET_INTERVALS[params.bucket];

  const query = `
    SELECT
      date_bin('${interval}'::interval, timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00') AS start,
      ${groupSelect} AS "group",
      COUNT(*)::bigint AS count
    FROM logs
    WHERE ${conditions.join(" AND ")}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC NULLS FIRST
  `;

  const result = await pool.query(query, values);

  return {
    buckets: result.rows.map((row) => ({
      start: new Date(row.start).toISOString(),
      group: row.group,
      count: Number(row.count),
    })),
  };
}