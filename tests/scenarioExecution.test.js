import http from 'node:http';
import { runStressTest } from '../src/core/runner.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Scenario execution', () => {
  test('executes scenario steps sequentially and records per-endpoint metrics', async () => {
    const counts = { '/login': 0, '/profile': 0 };

    const server = http.createServer((req, res) => {
      if (req.url in counts) {
        counts[req.url]++;
      }
      res.statusCode = 200;
      res.end('ok');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const config = {
      baseUrl: `http://127.0.0.1:${port}`,
      concurrency: 2,
      duration: 1,
      scenarios: [
        {
          name: 'userFlow',
          steps: [
            { path: '/login', method: 'GET' },
            { path: '/profile', method: 'GET' },
          ],
        },
      ],
    };

    const summary = await runStressTest(config, {
      reportFormat: 'txt',
      reportPath: join(tmpdir(), 'scenario-report.txt'),
    });

    await new Promise((resolve) => server.close(resolve));

    expect(counts['/login']).toBeGreaterThan(0);
    expect(counts['/profile']).toBeGreaterThan(0);
    expect(summary.perEndpoint).toHaveProperty('GET /login');
    expect(summary.perEndpoint).toHaveProperty('GET /profile');
  });
});
