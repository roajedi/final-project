export const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogItem {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface RejectedLog {
  index: number;
  reason: string;
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const isoRegex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!isoRegex.test(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function isValidAttributes(
  value: unknown
): value is Record<string, string | number | boolean> {
  if (value === undefined) {
    return true;
  }

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  for (const attributeValue of Object.values(
    value as Record<string, unknown>
  )) {
    if (typeof attributeValue === "number") {
      if (!Number.isFinite(attributeValue)) {
        return false;
      }

      continue;
    }

    if (
      typeof attributeValue !== "string" &&
      typeof attributeValue !== "boolean"
    ) {
      return false;
    }
  }

  return true;
}

export function validateLog(input: unknown): {
  valid: true;
  value: LogItem;
} | {
  valid: false;
  reason: string;
} {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      valid: false,
      reason: "log entry must be an object",
    };
  }

  const log = input as Record<string, unknown>;

  if (!isValidIsoTimestamp(log.timestamp)) {
    return {
      valid: false,
      reason: "invalid timestamp",
    };
  }

  const timestamp = new Date(log.timestamp);

  if (
    timestamp.getTime() >
    Date.now() + 5 * 60 * 1000
  ) {
    return {
      valid: false,
      reason: "timestamp is more than five minutes in the future",
    };
  }

  if (
    typeof log.level !== "string" ||
    !LOG_LEVELS.includes(log.level as LogLevel)
  ) {
    return {
      valid: false,
      reason: `invalid level: '${String(log.level)}'`,
    };
  }

  if (
    typeof log.service !== "string" ||
    log.service.trim().length === 0
  ) {
    return {
      valid: false,
      reason: "service must be a non-empty string",
    };
  }

  if (
    typeof log.message !== "string" ||
    log.message.trim().length === 0
  ) {
    return {
      valid: false,
      reason: "message must be a non-empty string",
    };
  }

  if (!isValidAttributes(log.attributes)) {
    return {
      valid: false,
      reason:
        "attributes must be a flat object containing only strings, numbers, or booleans",
    };
  }

  return {
    valid: true,
    value: {
      timestamp: log.timestamp,
      level: log.level as LogLevel,
      service: log.service,
      message: log.message,
      attributes: log.attributes,
    },
  };
}

export function validateLogsBody(body: unknown): {
  valid: true;
  logs: unknown[];
} | {
  valid: false;
  reason: string;
} {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return {
      valid: false,
      reason: "request body must be an object",
    };
  }

  const request = body as Record<string, unknown>;

  if (!Array.isArray(request.logs)) {
    return {
      valid: false,
      reason: "request body must contain a logs array",
    };
  }

  if (request.logs.length === 0) {
    return {
      valid: false,
      reason: "logs array must not be empty",
    };
  }

  return {
    valid: true,
    logs: request.logs,
  };
}