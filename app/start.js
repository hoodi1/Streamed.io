/**
 * start.js — Dev launcher for Streamed.io
 * Starts Vite then Electron without relying on shell && chaining,
 * which breaks on Windows PowerShell.
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const PORT = 5173;

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const s = net.connect(port, 'localhost', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error(`Timed out waiting for port ${port}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function main() {
  // ── 1. Start Vite ──────────────────────────────────────────────────────────
  console.log('[dev] Starting Vite on port', PORT, '...');
  const vite = spawn(
    process.execPath,
    [path.join(__dirname, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit', env: { ...process.env } }
  );

  vite.on('error', (e) => { console.error('[dev] Vite error:', e); process.exit(1); });

  // ── 2. Wait for Vite to be ready ───────────────────────────────────────────
  console.log('[dev] Waiting for Vite...');
  await waitForPort(PORT);
  console.log('[dev] Vite ready!');

  // ── 3. Launch Electron ─────────────────────────────────────────────────────
  console.log('[dev] Launching Electron...');
  const electron = spawn(
    process.execPath,
    [path.join(__dirname, 'node_modules/electron/cli.js'), '.'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: `http://localhost:${PORT}`,
      },
    }
  );

  electron.on('error', (e) => console.error('[dev] Electron error:', e));
  electron.on('close', (code) => {
    console.log('[dev] Electron closed, shutting down Vite...');
    vite.kill();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => { vite.kill(); electron.kill(); process.exit(0); });
}

main().catch((e) => { console.error(e); process.exit(1); });
