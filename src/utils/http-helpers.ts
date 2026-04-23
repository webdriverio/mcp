import type { ServerResponse } from 'node:http';

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
