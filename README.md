# High-Throughput Log Ingestion Engine

A high-performance log ingestion and aggregation microservice built with Node.js, TypeScript, Express, and PostgreSQL. Designed to handle continuous high-throughput log ingestion with sub-second analytical queries.

---

## 🛠️ Architecture & Core Features

- **Ingestion Pipeline:** Bulk log ingestion optimized via PostgreSQL `UNNEST` multi-row inserts to prevent connection pool exhaustion.
- **Aggregation Engine:** Fast, time-bucketed metric summaries (`GET /logs/aggregate`) utilizing PostgreSQL `date_bin`.
- **Automated Retention:** Periodic background cleanup worker running every hour to prune expired logs based on configured retention policies.
- **Filtering & Search:** Full JSONB querying capabilities using GIN indexing for high-performance `attributes` filtering.
- **Pagination:** Stateless cursor-based pagination using Base64-encoded composite cursors (`timestamp`, `id`).

---

## 🗄️ Database Schema & Indexes

```sql
CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    level VARCHAR(20) NOT NULL,
    service VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Core Indexes for Optimization
CREATE INDEX IF NOT EXISTS idx_logs_timestamp_id ON logs (timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_logs_service ON logs (service);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level);
CREATE INDEX IF NOT EXISTS idx_logs_attributes ON logs USING GIN (attributes);