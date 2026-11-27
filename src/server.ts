#!/usr/bin/env node
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { parseArgs, type ParsedArgs } from './utils/parse-args';
import { extractHost, listenOn, sendJsonRpcError, serverUrl } from './utils/http-helpers';
import { installCrashHandlers } from './utils/crash-handlers';
import { clientLine, initializeClientInfo } from './utils/client-info';
import { closeAllSessions, killAllDriverTrees } from './session/lifecycle';
import { parseNetworkLogsMode } from './tools/session.tool';
import { createServer } from './create-server';

console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);

const defaultNetworkLogs = parseNetworkLogsMode(process.env.WDIO_MCP_NETWORK_LOGS);

async function main() {
  installCrashHandlers(process, console.error);
  process.on('exit', killAllDriverTrees);
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (args.http) {
    const handle: http.RequestListener = (req, res) => {

      const host = extractHost(req.headers.host ?? '');
      if (!args.allowedHosts.includes(host)) {
        sendJsonRpcError(res, 403, -32000, 'Host not allowed');
        return;
      }

      const origin = req.headers.origin;
      if (origin) {
        const wildcard = args.allowedOrigins.includes('*');
        const allowed = wildcard || args.allowedOrigins.includes(origin);
        if (!allowed) {
          console.error(`[WARN] Blocked origin: ${origin}. Add --allowedOrigins ${origin} (or '*' for all) to allow it.`);
          sendJsonRpcError(res, 403, -32000, 'Origin not allowed');
          return;
        }
        res.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin);
        if (!wildcard) res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, mcp-protocol-version');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      if (!req.url?.startsWith('/mcp')) {
        sendJsonRpcError(res, 404, -32601, 'Not found');
        return;
      }

      void (async () => {
        try {
          const chunks: Buffer[] = [];
          let totalSize = 0;
          for await (const chunk of req) {
            totalSize += (chunk as Buffer).length;
            if (totalSize > 1024 * 1024) {
              sendJsonRpcError(res, 413, -32600, 'Payload too large');
              return;
            }
            chunks.push(chunk as Buffer);
          }
          const raw = Buffer.concat(chunks).toString();
          let body: unknown;
          try {
            body = raw ? JSON.parse(raw) : undefined;
          } catch {
            sendJsonRpcError(res, 400, -32700, 'Parse error');
            return;
          }
          // a server per request never sees both initialize and initialized, so read the client from the request
          const clientInfo = initializeClientInfo(body);
          if (clientInfo) console.info(clientLine(clientInfo));
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          const server = createServer(defaultNetworkLogs);
          res.on('close', () => void server.close());
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ECONNRESET' || code === 'ECONNABORTED' || (e as Error).message === 'aborted') return;
          console.error('[WARN] Request failed:', e);
          if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal error');
        }
      })();
    };
    let listening: http.Server[];
    try {
      listening = await listenOn(args.hosts, args.port, handle);
    } catch (error) {
      console.error('Fatal error starting HTTP server:', error);
      process.exit(1);
    }
    const originsMsg = args.allowedOrigins.length ? args.allowedOrigins.join(', ') : '(none — browsers blocked)';
    console.error(`WebdriverIO MCP Server running on Streamable HTTP at ${serverUrl(args.hosts, args.port)}`);
    console.error(`  listening on:    ${listening.map((server) => (server.address() as AddressInfo).address).join(', ')}`);
    console.error(`  allowed hosts:   ${args.allowedHosts.join(', ')}`);
    console.error(`  allowed origins: ${originsMsg}`);

  } else {
    const transport = new StdioServerTransport();
    const server = createServer(defaultNetworkLogs);
    server.server.oninitialized = () => console.info(clientLine(server.server.getClientVersion()));
    await server.connect(transport);
    console.error('WebdriverIO MCP Server running on stdio');
    // the client closing stdin is how most of them stop a stdio server
    process.stdin.once('end', shutdown);
    process.stdin.once('close', shutdown);
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, shutdown);
  }
}

/** most time sessions get to close before the process exits anyway */
const SHUTDOWN_TIMEOUT_MS = 5000;
// MCP clients escalate stdin-close → SIGTERM → SIGKILL in about 4s; local drivers still closing by then must be killed before it.
const DRIVER_KILL_AFTER_MS = 3500;
let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(killAllDriverTrees, DRIVER_KILL_AFTER_MS).unref();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref());
  void Promise.race([closeAllSessions(), timeout]).finally(() => process.exit(0));
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
