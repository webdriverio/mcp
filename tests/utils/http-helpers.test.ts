import { describe, expect, it, vi } from 'vitest';
import { extractHost, sendJsonRpcError } from '../../src/utils/http-helpers';
import type { ServerResponse } from 'node:http';

describe('extractHost', () => {
  it('strips port from IPv4 host', () => {
    expect(extractHost('localhost:3000')).toBe('localhost');
  });

  it('returns IPv4 address without port unchanged', () => {
    expect(extractHost('127.0.0.1')).toBe('127.0.0.1');
  });

  it('extracts IPv6 address from bracketed host with port', () => {
    expect(extractHost('[::1]:3000')).toBe('::1');
  });

  it('extracts IPv6 address from bracketed host without port', () => {
    expect(extractHost('[::1]')).toBe('::1');
  });

  it('returns empty string for empty input', () => {
    expect(extractHost('')).toBe('');
  });

  it('returns original string for malformed bracket (no closing bracket)', () => {
    expect(extractHost('[::1')).toBe('[::1');
  });
});

describe('sendJsonRpcError', () => {
  it('writes status, JSON content-type, and a JSON-RPC error envelope', () => {
    const writeHead = vi.fn().mockReturnThis();
    const end = vi.fn();
    const res = { writeHead, end } as unknown as ServerResponse;

    sendJsonRpcError(res, 403, -32000, 'Host not allowed');

    expect(writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'application/json' });
    expect(end).toHaveBeenCalledWith(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Host not allowed' } }),
    );
  });

  it('includes the provided code and message in the envelope', () => {
    const end = vi.fn();
    const res = { writeHead: vi.fn().mockReturnThis(), end } as unknown as ServerResponse;

    sendJsonRpcError(res, 400, -32700, 'Parse error');

    const body = JSON.parse(end.mock.calls[0][0] as string);
    expect(body.error).toEqual({ code: -32700, message: 'Parse error' });
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBeNull();
  });
});
