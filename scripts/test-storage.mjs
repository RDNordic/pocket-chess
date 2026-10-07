import { createServer } from 'vite';
import { spawn } from 'node:child_process';

// Local test runner only. Server stays in this process so closing it cannot
// orphan a Windows npm shell/Vite process tree. No browser profile reuse.
const server = await createServer({ server: { host: '127.0.0.1', port: 4186, strictPort: true } });
try {
  await server.listen();
  process.exitCode = await new Promise((resolve, reject) => {
    const runner = spawn(process.execPath, ['./node_modules/@playwright/test/cli.js', 'test', '--config=playwright.storage.config.ts'], { stdio: 'inherit' });
    runner.once('error', reject);
    runner.once('exit', code => resolve(code ?? 1));
  });
} finally { await server.close(); }
