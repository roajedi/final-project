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
  const values: unknown[] = [];

  const conditions: string[] = [
    `timestamp >= $1::timestamptz`,
    `timestamp < $2::timestamptz`
  ];
  values.push(params.since, params.until);

  if (params.service !== undefined) {
    conditions.push(`service = $${values.length + 1}`);
    values.push(params.service);
  }

  if (params.level !== undefined) {
    conditions.push(`level = $${values.length + 1}`);
    values.push(params.level);
  }

  if (params.q !== undefined) {
    conditions.push(`message LIKE $${values.length + 1}`);
    values.push(`%${params.q}%`);
  }

  for (const attribute of params.attributes) {
    conditions.push(`attributes @> $${values.length + 1}::jsonb`);
    values.push(JSON.stringify({ [attribute.key]: attribute.value }));
  }

  const groupCol = params.groupBy === "service" ? "service" : params.groupBy === "level" ? "level" : null;
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
    ORDER BY start ASC, "group" ASC NULLS FIRST
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