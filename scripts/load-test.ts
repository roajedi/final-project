const TOTAL_LOGS = 100_000;
const BATCH_SIZE = 10_000;
const LOGS_URL = 'http://localhost:8080/logs';
const CONCURRENCY_LIMIT = 4; 

function generateBatch() {
  const logs = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    logs.push({
      timestamp: new Date().toISOString(),
      level: i % 2 === 0 ? 'error' : 'info',
      service: i % 3 === 0 ? 'payment' : 'auth',
      message: `Load test log entry ${i}`,
      attributes: { env: 'production', attempt: i }
    });
  }
  return JSON.stringify({ logs });
}

async function run() {
  console.log(` Starting Load Test: ${TOTAL_LOGS} logs in batches of ${BATCH_SIZE}...`);
  const startTime = Date.now();
  let sentLogs = 0;

  const batchPayload = generateBatch();

  const sendBatch = async () => {
    const res = await fetch(LOGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: batchPayload
    });

    if (!res.ok) {
      throw new Error(`Status Code: ${res.status}`);
    }
  };

  const totalBatches = TOTAL_LOGS / BATCH_SIZE;
  const batches = Array.from({ length: totalBatches });

  for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
    const chunk = batches.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      chunk.map(() =>
        sendBatch().then(() => {
          sentLogs += BATCH_SIZE;
        })
      )
    );
  }

  const durationInSeconds = (Date.now() - startTime) / 1000;
  const throughput = Math.round(sentLogs / durationInSeconds);

  console.log(` Finished in ${durationInSeconds.toFixed(2)}s`);
  console.log(` Ingestion Throughput: ${throughput.toLocaleString()} logs/sec`);
}

run().catch(console.error);