#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { exec } from 'node:child_process';

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

function findLatestTrace(): string | null {
  const traceDir = join(process.cwd(), '.trace');
  if (!existsSync(traceDir)) return null;

  const zips = readdirSync(traceDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => ({ name: f, mtime: statSync(join(traceDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return zips.length > 0 ? join(traceDir, zips[0].name) : null;
}

const argPath = process.argv[2];
let absolutePath: string;

if (argPath) {
  absolutePath = resolve(argPath);
  if (!existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }
} else {
  const latest = findLatestTrace();
  if (!latest) {
    console.error('No trace found. Run a session with trace enabled, or pass a zip path.');
    process.exit(1);
  }
  absolutePath = latest;
  console.error(`Using latest trace: ${absolutePath}`);
}

const fileName = basename(absolutePath);
const fileData = readFileSync(absolutePath);

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'https://player.vibium.dev',
      'Access-Control-Allow-Methods': 'GET',
    });
    res.end();
    return;
  }

  if (req.url === `/${fileName}`) {
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': String(fileData.length),
      'Access-Control-Allow-Origin': 'https://player.vibium.dev',
    });
    res.end(fileData);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const traceUrl = `http://localhost:${port}/${fileName}`;
  const viewerUrl = `https://player.vibium.dev/?record=${encodeURIComponent(traceUrl)}`;

  console.error(`Serving ${fileName} on ${traceUrl}`);
  console.error(`Opening ${viewerUrl}`);
  console.error('Press Ctrl+C to stop.');

  openBrowser(viewerUrl);
});