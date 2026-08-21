import { pool } from "./index.js";
import type { LogItem } from "../validation/log.validation.js";

export interface LogQueryParams {
  service?: string;
  level?: string;
  since?: string;
  until?: string;
  q?: string;
  attributes?: Array<{
    key: string;
    value: any;
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

  if (params.service) {
    conditions.push(`service = $${values.length + 1}`);
    values.push(params.service);
  }

  if (params.level) {
    conditions.push(`level = $${values.length + 1}`);
    values.push(params.level);
  }

  if (params.since) {
    conditions.push(`timestamp >= $${values.length + 1}::timestamptz`);
    values.push(params.since);
  }

  if (params.until) {
    conditions.push(`timestamp < $${values.length + 1}::timestamptz`);
    values.push(params.until);
  }

  if (params.q) {
    conditions.push(`message LIKE $${values.length + 1}`);
    values.push(`%${params.q}%`);
  }

  if (params.attributes && Array.isArray(params.attributes) && params.attributes.length > 0) {
    for (const attribute of params.attributes) {
      if (attribute && attribute.key !== undefined) {
        conditions.push(`attributes @> $${values.length + 1}::jsonb`);
        // Parsed safely to handle string/number/boolean values in jsonb
        let val = attribute.value;
        try {
          if (typeof val === 'string' && (val === 'true' || val === 'false' || !isNaN(Number(val)))) {
            val = JSON.parse(val);
          }
        } catch (_) {}
        values.push(JSON.stringify({ [attribute.key]: val }));
      }
    }
  }

  return conditions;
}

export async function insertLogs(logs: LogItem[]) {
  if (logs.length === 0) return 0;

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
    values.push(params.cursor.timestamp, params.cursor.id);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

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

    nextCursor = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  const formattedLogs = rows.map((r) => ({
    id: String(r.id),
    timestamp: new Date(r.timestamp).toISOString(),
    level: r.level,
    service: r.service,
    message: r.message,
    attributes: r.attributes || {},
  }));

  return {
    logs: formattedLogs,
    next_cursor: nextCursor,
  };
}