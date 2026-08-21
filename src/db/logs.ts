import { pool } from "./index.js";
import type { LogItem } from "../validation/log.validation.js";

export interface LogQueryParams {
  service?: string;
  level?: string;
  since?: string;
  until?: string;
  q?: string;
  attributes: Array<{
    key: string;
    value: string;
  }>;
  cursor?: {
    timestamp: string;
    id: string;
  };
  limit: number;
}

function buildFilters(
  params: Omit<LogQueryParams, "limit" | "cursor">,
  values: unknown[],
): string[] {
  const conditions: string[] = [];

  if (params.service !== undefined) {
    conditions.push(`service = $${values.length + 1}`);
    values.push(params.service);
  }

  if (params.level !== undefined) {
    conditions.push(`level = $${values.length + 1}`);
    values.push(params.level);
  }

  if (params.since !== undefined) {
    conditions.push(`timestamp >= $${values.length + 1}::timestamptz`);
    values.push(params.since);
  }

  if (params.until !== undefined) {
    conditions.push(`timestamp < $${values.length + 1}::timestamptz`);
    values.push(params.until);
  }

  if (params.q !== undefined) {
    conditions.push(`message LIKE $${values.length + 1}`);
    values.push(`%${params.q}%`);
  }

  for (const attribute of params.attributes) {
    conditions.push(`attributes @> $${values.length + 1}::jsonb`);
    values.push(JSON.stringify({ [attribute.key]: attribute.value }));
  }

  return conditions;
}

export async function insertLogs(logs: LogItem[]) {
  if (logs.length === 0) {
    return 0;
  }

  const timestamps: string[] = [];
  const levels: string[] = [];
  const services: string[] = [];
  const messages: string[] = [];
  const attributes: string[] = [];

  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    timestamps.push(l.timestamp);
    levels.push(l.level);
    services.push(l.service);
    messages.push(l.message);
    attributes.push(l.attributes ? JSON.stringify(l.attributes) : '{}');
  }

  const result = await pool.query(
    `
    INSERT INTO logs (timestamp, level, service, message, attributes)
    SELECT 
      t::timestamptz, 
      l, 
      s, 
      m, 
      a::jsonb
    FROM UNNEST(
      $1::text[], 
      $2::text[], 
      $3::text[], 
      $4::text[], 
      $5::jsonb[]
    ) AS t(t, l, s, m, a)
    `,
    [timestamps, levels, services, messages, attributes]
  );

  return result.rowCount ?? logs.length;
}

export async function queryLogs(params: LogQueryParams) {
  const values: unknown[] = [];

  const filters = buildFilters(
    {
      service: params.service,
      level: params.level,
      since: params.since,
      until: params.until,
      q: params.q,
      attributes: params.attributes,
    },
    values
  );

  if (params.cursor) {
    filters.push(
      `(timestamp, id) < ($${values.length + 1}::timestamptz, $${values.length + 2}::bigint)`
    );

    values.push(
      params.cursor.timestamp,
      params.cursor.id
    );
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(" AND ")}`
      : "";

  const limitIndex = values.length + 1;
  values.push(params.limit + 1);

  const result = await pool.query(
    `
    SELECT
      id,
      timestamp,
      level,
      service,
      message,
      attributes
    FROM logs
    ${whereClause}
    ORDER BY timestamp DESC, id DESC
    LIMIT $${limitIndex}
    `,
    values
  );

  const rows = result.rows;

  let nextCursor: string | null = null;

  if (rows.length > params.limit) {
    rows.pop();

    const last = rows[rows.length - 1];

    const cursor = {
      timestamp: new Date(last.timestamp).toISOString(),
      id: String(last.id),
    };

    nextCursor = Buffer
      .from(JSON.stringify(cursor))
      .toString("base64url");
  }

  return {
    logs: rows,
    next_cursor: nextCursor,
  };
}