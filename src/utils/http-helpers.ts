import http, { type ServerResponse } from 'node:http';

export function extractHost(header: string): string {
  if (header.startsWith('[')) {
    const end = header.indexOf(']');
    return end === -1 ? header : header.slice(1, end);
  }
  return header.split(':')[0];
}

export function sendJsonRpcError(res: ServerResponse, httpStatus: number, code: number, message: string): void {
  const body = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } });
  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(body);
}

const MISSING_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

/**
 * One server per address. Of several addresses, one the machine lacks (`::1` with IPv6 off) is skipped as long as
 * another listens; any other error, or a single address failing, rejects.
 */
export async function listenOn(hosts: string[], port: number, handle: http.RequestListener): Promise<http.Server[]> {
  const listening: http.Server[] = [];
  for (const host of hosts) {
    try {
      const server = http.createServer(handle);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject).listen(port, host, resolve);
      });
      listening.push(server);
    } catch (e) {
      if (hosts.length === 1 || !MISSING_ADDRESS.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
    }
  }
  if (!listening.length) throw new Error(`None of ${hosts.join(', ')} is available to listen on`);
  return listening;
}

const WILDCARD_HOSTS = ['0.0.0.0', '::'];

export function serverUrl(hosts: string[], port: number): string {
  const host = hosts.length > 1 || WILDCARD_HOSTS.includes(hosts[0]) ? 'localhost' : hosts[0];
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}/mcp`;
}
