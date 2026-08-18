const TOTAL_LOGS = 100_000;
const BATCH_SIZE = 10_000;
const LOGS_URL = "http://localhost:8080/logs";
const CONCURRENCY_LIMIT = 4;

const API_KEY = process.env.LOADGEN_API_KEY;

function generateBatch() {
  const logs = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    logs.push({
      timestamp: new Date().toISOString(),
      level: i % 2 === 0 ? "error" : "info",
      service: i % 3 === 0 ? "payment" : "auth",
      message: `Load test log entry ${i}`,
      attributes: {
        env: "production",
        attempt: i,
      },
    });
  }

  return JSON.stringify({ logs });
}

async function sendBatch() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const res = await fetch(LOGS_URL, {
    method: "POST",
    headers,
    body: generateBatch(),
  });

  if (!res.ok) {
    const body = await res.text();

    throw new Error(
      `Status Code: ${res.status}, Body: ${body}`
    );
  }
}

async function run() {
  console.log(
    `Starting Load Test: ${TOTAL_LOGS} logs ` +
    `in batches of ${BATCH_SIZE}...`
  );

  const startTime = Date.now();
  let sentLogs = 0;

  const totalBatches = Math.ceil(
    TOTAL_LOGS / BATCH_SIZE
  );

  const batches = Array.from({
    length: totalBatches,
  });

  for (
    let i = 0;
    i < batches.length;
    i += CONCURRENCY_LIMIT
  ) {
    const chunk = batches.slice(
      i,
      i + CONCURRENCY_LIMIT
    );

    await Promise.all(
      chunk.map(async () => {
        await sendBatch();
        sentLogs += BATCH_SIZE;
      })
    );

    console.log(
      `Progress: ${Math.min(sentLogs, TOTAL_LOGS)}/${TOTAL_LOGS}`
    );
  }

  const durationInSeconds =
    (Date.now() - startTime) / 1000;

  const throughput = Math.round(
    Math.min(sentLogs, TOTAL_LOGS) /
    durationInSeconds
  );

  console.log(
    `Finished in ${durationInSeconds.toFixed(2)}s`
  );

  console.log(
    `Ingestion Throughput: ${throughput.toLocaleString()} logs/sec`
  );
}

run().catch((error) => {
  console.error("Load test failed:", error);
  process.exit(1);
});