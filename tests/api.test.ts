// @ts-ignore
import assert from 'node:assert';
// @ts-ignore
import { test, describe } from 'node:test';

const BASE_URL = 'http://localhost:8080';

describe('API Integration Tests', () => {

  test('POST /logs - should ingest a batch of logs', async () => {
    const payload = {
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          service: 'auth-service',
          message: 'User logged in successfully',
          attributes: { env: 'test', userId: '123' }
        },
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'payment-service',
          message: 'Payment gateway timeout',
          attributes: { env: 'test', amount: '100' }
        }
      ]
    };

    const res = await fetch(`${BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.ok(res.status === 200 || res.status === 201);
  });

  test('GET /logs - should retrieve logs with filters', async () => {
    const res = await fetch(`${BASE_URL}/logs?service=auth-service&limit=10`);
    const data = await res.json() as { logs: unknown[] };

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data.logs));
  });

  test('GET /logs/aggregate - should aggregate log counts by interval', async () => {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const until = new Date().toISOString();

    const res = await fetch(`${BASE_URL}/logs/aggregate?interval=1 minute&since=${since}&until=${until}`);
    assert.strictEqual(res.status, 200);
  });

});