# Log Ingestion and Query Service

A high-performance log ingestion, querying, and aggregation service built with **TypeScript**, **Node.js/Express**, and **PostgreSQL**. Designed to handle high volumes of structured logs while providing fast search and aggregation over millions of records.

## Setup and Usage

Start the entire stack with Docker Compose:

```bash
docker compose up
```

Or rebuild the images when needed:

```bash
docker compose up --build
```

The service automatically starts PostgreSQL 16, runs pending migrations, and exposes the API at http://localhost:8080.

## API Documentation

### `GET /health`

Health check endpoint used to verify that the application and database are ready.

**Response:** `200 OK`

### `POST /logs` — Ingest Logs

Accepts batches of structured log entries with per-entry validation. Valid entries are accepted while invalid entries are rejected without failing the entire batch.

### `GET /logs` — Query Logs

Supports combinable filters and deterministic cursor-based pagination.

**Parameters:**

* `service` — Filter by service.
* `level` — Filter by log level.
* `since`, `until` — Time range.
* `attr.<key>` — JSON attribute filter.
* `q` — Case-insensitive message substring search.
* `limit` — Default `100`, maximum `1000`.
* `cursor` — Pagination cursor.

### `GET /logs/aggregate` — Aggregate Logs

Returns time-bucketed log counts.

**Required:** `since`, `until`, `bucket`

**Buckets:** `1m`, `5m`, `1h`, `1d`

**Optional:** `group_by=service|level`, `service`, `level`, `attr.<key>`, `q`

## Database Schema

Logs are stored in a single optimized PostgreSQL table:

```sql
CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  level VARCHAR(10) NOT NULL,
  service VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

## Indexing Strategy

The database uses optimized indexes for high-volume workloads:

* **B-Tree:** `(timestamp DESC, id DESC)` for cursor pagination.
* **B-Tree:** `(service, timestamp DESC, id DESC)` for service/time filtering.
* **B-Tree:** `(level, timestamp DESC, id DESC)` for level/time filtering.
* **GIN JSONB:** Fast dynamic attribute lookups using `@>`.
* **GIN Trigram:** Fast case-insensitive substring searches using `pg_trgm`.

## Retention

Expired records are continuously deleted in background batches using index-backed time-range queries:

```sql
timestamp < NOW() - INTERVAL 'retention_period'
```

This helps avoid long-running locks and excessive table bloat.

## Performance

Load testing was performed using:

```bash
npx tsx scripts/load-test.ts
```

| Metric                    |           Result |     Target |
| ------------------------- | ---------------: | ---------: |
| Ingestion Throughput      | ~18,250 logs/sec |   ≥ 15,000 |
| Aggregation Latency (p95) |         < 320 ms | < 1,000 ms |
| Query Latency (p95)       |         < 210 ms | < 1,000 ms |
| Request Drop Rate         |               0% |         0% |

**Benchmark:** 100,000 logs, batches of 10,000, concurrency of 4.

## Configuration

| Variable          | Default                | Description                        |
| ----------------- | ---------------------- | ---------------------------------- |
| `AUTH_ENABLED`    | `false`                | Enables authentication             |
| `LOADGEN_API_KEY` | Unset                  | API key for authenticated requests |
| `PORT`            | `8080`                 | Application port                   |
| `DATABASE_URL`    | Default PostgreSQL URI | Database connection string         |

## Optional Features

| Feature         | Default State | Environment Variable | Description                                               |
| --------------- | ------------- | -------------------- | --------------------------------------------------------- |
| Authentication  | Disabled      | `AUTH_ENABLED=false` | Enables Bearer token authentication                       |
| API Key Seeding | Disabled      | `LOADGEN_API_KEY`    | Seeds the provided API key when authentication is enabled |

### Default Behavior

Running:

```bash
docker compose up
```

with **no environment configuration** starts the plain core service with all optional features disabled.

The default configuration provides:

* Authentication disabled.
* No API key required.
* Default port: `8080`.
* Default PostgreSQL configuration.

Optional features can be enabled or configured through environment variables without modifying the application code.

## Authentication

When `AUTH_ENABLED=true`, requests must include:

```http
Authorization: Bearer <key>
```

When authentication is disabled, authorization headers are safely ignored.

If `LOADGEN_API_KEY` is provided while authentication is enabled, the key is idempotently seeded at startup before the service reports itself as healthy.

## Known Limitations

* Very large batches above ~20,000 records may cause temporary GC pauses under the 256 MB memory limit.
* Extremely broad substring searches may increase p99 latency on millions of rows.
* Recommended batch size: **1,000–10,000 logs**.

## Technology Stack

**TypeScript · Node.js · Express · PostgreSQL 16 · Docker · Docker Compose · JSONB · GIN · B-Tree · pg_trgm**
