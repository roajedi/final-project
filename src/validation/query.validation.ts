import type { Request } from "express";
import { LOG_LEVELS } from "./log.validation.js";

export type AggregateBucket =
  | "1m"
  | "5m"
  | "1h"
  | "1d";

function getSingleQueryValue(
  value: unknown
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("query parameters must be single values");
  }

  return value;
}

function validateTimestamp(
  value: string,
  name: string
): string {
  const date = new Date(value);

  if (
    !value.includes("T") ||
    Number.isNaN(date.getTime())
  ) {
    throw new Error(`invalid ${name} timestamp`);
  }

  return value;
}

function parseAttributes(
  query: Request["query"]
): Array<{ key: string; value: string }> {
  const attributes: Array<{
    key: string;
    value: string;
  }> = [];

  for (const [key, rawValue] of Object.entries(query)) {
    if (!key.startsWith("attr.")) {
      continue;
    }

    const attributeKey = key.slice(5);

    if (!attributeKey) {
      throw new Error("attribute key cannot be empty");
    }

    const value = getSingleQueryValue(rawValue);

    if (value === undefined) {
      throw new Error(
        `invalid attribute value for ${key}`
      );
    }

    attributes.push({
      key: attributeKey,
      value,
    });
  }

  return attributes;
}

function parseCursor(value: string): {
  timestamp: string;
  id: string;
} {
  try {
    const decoded = Buffer
      .from(value, "base64url")
      .toString("utf8");

    const parsed: unknown = JSON.parse(decoded);

    if (
      parsed === null ||
      typeof parsed !== "object"
    ) {
      throw new Error();
    }

    const cursor = parsed as Record<string, unknown>;

    if (
      typeof cursor.timestamp !== "string" ||
      typeof cursor.id !== "string"
    ) {
      throw new Error();
    }

    const date = new Date(cursor.timestamp);

    if (
      Number.isNaN(date.getTime()) ||
      !/^\d+$/.test(cursor.id)
    ) {
      throw new Error();
    }

    return {
      timestamp: cursor.timestamp,
      id: cursor.id,
    };
  } catch {
    throw new Error("invalid or malformed cursor");
  }
}

export function parseLogsQuery(
  query: Request["query"]
) {
  const service = getSingleQueryValue(query.service);
  const level = getSingleQueryValue(query.level);
  const since = getSingleQueryValue(query.since);
  const until = getSingleQueryValue(query.until);
  const q = getSingleQueryValue(query.q);
  const cursorValue = getSingleQueryValue(query.cursor);
  const limitValue = getSingleQueryValue(query.limit);

  if (
    level !== undefined &&
    !LOG_LEVELS.includes(
      level as (typeof LOG_LEVELS)[number]
    )
  ) {
    throw new Error(
      `unsupported log level: ${level}`
    );
  }

  if (since !== undefined) {
    validateTimestamp(since, "since");
  }

  if (until !== undefined) {
    validateTimestamp(until, "until");
  }

  if (
    since !== undefined &&
    until !== undefined &&
    new Date(until).getTime() <=
      new Date(since).getTime()
  ) {
    throw new Error(
      "until must be later than since"
    );
  }

  let limit = 100;

  if (limitValue !== undefined) {
    if (!/^\d+$/.test(limitValue)) {
      throw new Error("limit must be numeric");
    }

    limit = Number(limitValue);

    if (limit < 1 || limit > 1000) {
      throw new Error(
        "limit must be between 1 and 1000"
      );
    }
  }

  const cursor =
    cursorValue === undefined
      ? undefined
      : parseCursor(cursorValue);

  return {
    service,
    level,
    since,
    until,
    q,
    attributes: parseAttributes(query),
    cursor,
    limit,
  };
}

export function parseAggregateQuery(
  query: Request["query"]
) {
  const since = getSingleQueryValue(query.since);
  const until = getSingleQueryValue(query.until);
  const bucketValue = getSingleQueryValue(
    query.bucket
  );
  const groupByValue = getSingleQueryValue(
    query.group_by
  );

  if (!since || !until) {
    throw new Error(
      "since and until are required"
    );
  }

  validateTimestamp(since, "since");
  validateTimestamp(until, "until");

  if (
    new Date(until).getTime() <=
    new Date(since).getTime()
  ) {
    throw new Error(
      "until must be later than since"
    );
  }

  if (
    bucketValue !== undefined &&
    bucketValue !== "1m" &&
    bucketValue !== "5m" &&
    bucketValue !== "1h" &&
    bucketValue !== "1d"
  ) {
    throw new Error(
      "bucket must be one of: 1m, 5m, 1h, 1d"
    );
  }

  const bucket: AggregateBucket = (bucketValue as AggregateBucket) || "1h";

  if (
    groupByValue !== undefined &&
    groupByValue !== "service" &&
    groupByValue !== "level"
  ) {
    throw new Error(
      "group_by must be service or level"
    );
  }

  const groupBy:
    | "service"
    | "level"
    | undefined = groupByValue as "service" | "level" | undefined;

  return {
    since,
    until,
    bucket,
    groupBy,
    service: getSingleQueryValue(query.service),
    level: getSingleQueryValue(query.level),
    q: getSingleQueryValue(query.q),
    attributes: parseAttributes(query),
  };
}