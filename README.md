أكيد. رتبتلك نفس المحتوى **بدون تغيير جوهري**، لكن صححت تنسيق Markdown بحيث لما تلصقه في `README.md` تظهر العناوين والنقاط والأكواد والجداول بشكل واضح على GitHub.

# Log Ingestion and Query Service

A high-throughput, structured log ingestion and querying engine built with **TypeScript**, **Node.js**, and **PostgreSQL**, fully containerized via **Docker Compose**.

---

## System Architecture

The service is designed to ingest large batches of structured logs, validate each entry individually, store them efficiently in PostgreSQL, and offer fast filtering and bucketed aggregations.

### Key Components

* **HTTP Server:** Node.js REST API with Fastify/Express for minimal overhead.
* **Database Layer:** PostgreSQL using `pg` connection pool with parameterization to prevent SQL injection.
* **Bulk Ingestion:** Uses PostgreSQL `UNNEST` array insertion to minimize network round-trips during high-volume ingestion.
* **Pagination:** Opaque base64-encoded cursor using composite tuple `(timestamp, id)` ensuring deterministic pagination without missing or duplicate rows.

---

## Schema & Index Strategy

### Table Definition

```sql
CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    level VARCHAR(10) NOT NULL,
    service VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

### Indexing Strategy

* **`idx_logs_timestamp_id`**: Multi-column index on `(timestamp DESC, id DESC)` supporting primary log retrieval and cursor pagination.
* **`idx_logs_service_timestamp`**: Covering index for filtering by service and range queries.
* **`idx_logs_level_timestamp`**: Covering index for level-based filtering.
* **`idx_logs_attributes_gin`**: GIN index on `attributes` using `jsonb_path_ops` for fast JSON equality filters.

---

## Retention Strategy

Logs are automatically purged based on a configurable retention period, defaulting to **30 days**.

Expired records are deleted in small batches during low-traffic periods using background cron/interval workers to prevent long-running table locks and table bloat.

---

## Getting Started

### Prerequisites

* Docker
* Docker Compose

### Running the Service

Start the complete stack (Database + API):

```bash
docker compose up --build
```

The application will apply migrations and start listening on:

`http://localhost:8080`

---

## API Documentation

### 1. Health Check

`GET /health`

* **Response:** `200 OK` when DB is connected and migrations are applied.

### 2. Ingest Logs

`POST /logs`

* **Accepts:** Batch array of logs.
* **Validation:** Each entry is validated individually.
* **Response:** `200 OK` when at least one record is accepted.

Example response:

```json
{
  "accepted": 9,
  "rejected": [
    {
      "index": 3,
      "reason": "invalid level: 'critical'"
    }
  ]
}
```

### 3. Query Logs

`GET /logs`

**Query Parameters:**

* `service`
* `level`
* `since`
* `until`
* `attr.<key>`
* `q`
* `limit`
* `cursor`

Example response:

```json
{
  "logs": [],
  "next_cursor": "eyJpZCI6..."
}
```

### 4. Aggregate Logs

`GET /logs/aggregate`

**Query Parameters:**

* `since`
* `until`
* `bucket` — `1m`, `5m`, `1h`, `1d`
* `group_by` — `service` or `level`

---

## Benchmark Results

Below are the official benchmark results produced by `@foothill/logs-benchmark`:

```json
{
  "tool": "@foothill/logs-benchmark",
  "generatedAt": "2026-08-21T13:06:09.074Z",
  "score": {
    "totalScore": 62.28,
    "maximumScore": 100,
    "correctness": {
      "points": 15,
      "maximum": 15,
      "passed": "15/15"
    },
    "reliability": {
      "points": 20,
      "maximum": 20,
      "status": "100% Crash-Free & Scenario Completion"
    },
    "performance": {
      "points": 21.28,
      "maximum": 50
    },
    "queries": {
      "points": 6,
      "maximum": 15
    }
  },
  "environment": {
    "engine": "Docker Desktop (8 CPUs, 8 GB RAM)",
    "resourceLimits": {
      "application": "0.5 CPU / 256 MB RAM",
      "postgres": "1.0 CPU / 1024 MB RAM"
    },
    "machineSpeedFactor": 0.2926
  }
}
```

### Performance Highlights

* **Correctness:** **15 / 15 (100%)** — All validation, querying, cursor stability, and aggregation tests passed.
* **Reliability:** **20 / 20 (100%)** — 0 crashes across all load, stress, spike, and breakpoint scenarios.
* **Machine Constraint:** Local execution speed was benchmarked at `0.29x` reference speed due to high generator load on local hardware. Higher throughput is achieved on standard cloud execution environments.

---

## Optional Features Configuration

| Feature                | Default State | Environment Variable |
| ---------------------- | ------------- | -------------------- |
| Authentication         | Disabled      | `AUTH_ENABLED=false` |
| API Key Authentication | Disabled      | `LOADGEN_API_KEY`    |

### Default Behavior

Running:

```bash
docker compose up
```

with **no additional configuration** starts the **plain core service** with optional features disabled and no authentication required.

This default behavior is compliant with the load generator contract.
