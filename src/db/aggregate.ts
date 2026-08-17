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

const BUCKET_EXPRESSIONS = {
  "1m": `date_bin('1 minute', timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00')`,
  "5m": `date_bin('5 minutes', timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00')`,
  "1h": `date_bin('1 hour', timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00')`,
  "1d": `date_bin('1 day', timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00')`,
} as const;

export async function aggregateLogs(params: AggregateParams) {
  const values: unknown[] = [];

  const conditions: string[] = [
    `timestamp >= $${values.length + 1}::timestamptz`,
  ];
  values.push(params.since);

  conditions.push(`timestamp < $${values.length + 1}::timestamptz`);
  values.push(params.until);

  if (params.service !== undefined) {
    conditions.push(`service = $${values.length + 1}`);
    values.push(params.service);
  }

  if (params.level !== undefined) {
    conditions.push(`level = $${values.length + 1}`);
    values.push(params.level);
  }

  if (params.q !== undefined) {
    conditions.push(`message ILIKE $${values.length + 1}`);
    values.push(`%${params.q}%`);
  }

  for (const attribute of params.attributes) {
    const keyIndex = values.length + 1;
    values.push(attribute.key);

    const valueIndex = values.length + 1;
    values.push(attribute.value);

    conditions.push(`attributes @> $${values.length + 1}::jsonb`);
    values.push(JSON.stringify({ [attribute.key]: attribute.value }));
  }

  const hasGroupBy = params.groupBy !== undefined;
  const groupColumn = hasGroupBy ? params.groupBy : "NULL";
  const bucketExpression = BUCKET_EXPRESSIONS[params.bucket];

  const groupByClause = hasGroupBy
    ? `GROUP BY ${bucketExpression}, ${groupColumn}`
    : `GROUP BY ${bucketExpression}`;

  const query = `
    SELECT
      ${bucketExpression} AS start,
      ${groupColumn} AS "group",
      COUNT(*)::bigint AS count
    FROM logs
    WHERE ${conditions.join(" AND ")}
    ${groupByClause}
    ORDER BY
      start ASC,
      "group" ASC NULLS FIRST
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