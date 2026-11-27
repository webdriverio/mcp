import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/utils/parse-args';

const defaults = {
  http: false,
  port: 3000,
  allowedHosts: ['localhost', '127.0.0.1', '::1'],
  allowedOrigins: [] as string[],
  allowCode: false,
  hosts: ['127.0.0.1', '::1'],
};

describe('parseArgs', () => {
  it('defaults to stdio, port 3000, localhost allowlist, no origins', () => {
    expect(parseArgs([])).toEqual(defaults);
  });

  it('enables http mode with --http flag', () => {
    expect(parseArgs(['--http'])).toEqual({ ...defaults, http: true });
  });

  it('parses custom port with --port flag', () => {
    expect(parseArgs(['--http', '--port', '8080'])).toEqual({ ...defaults, http: true, port: 8080 });
  });

  it('parses --port without --http', () => {
    expect(parseArgs(['--port', '9000'])).toEqual({ ...defaults, port: 9000 });
  });

  it('throws on non-numeric --port value', () => {
    expect(() => parseArgs(['--http', '--port', 'foo'])).toThrow('--port must be a valid number');
  });

  it('throws when --port has no value', () => {
    expect(() => parseArgs(['--http', '--port'])).toThrow('--port must be a valid number');
  });

  it('throws on --port 0', () => {
    expect(() => parseArgs(['--port', '0'])).toThrow('--port must be a valid number');
  });

  it('parses --allowedHosts as comma-separated list', () => {
    expect(parseArgs(['--http', '--allowedHosts', 'example.com,api.example.com'])).toEqual({
      ...defaults,
      http: true,
      allowedHosts: ['example.com', 'api.example.com'],
    });
  });

  it('trims whitespace from --allowedHosts entries', () => {
    expect(parseArgs(['--allowedHosts', 'localhost, mydevbox'])).toEqual({
      ...defaults,
      allowedHosts: ['localhost', 'mydevbox'],
    });
  });

  it('throws when --allowedHosts has no value', () => {
    expect(() => parseArgs(['--http', '--allowedHosts'])).toThrow('--allowedHosts requires a comma-separated list');
  });

  it('throws when --allowedHosts is followed by another known flag', () => {
    expect(() => parseArgs(['--http', '--allowedHosts', '--http'])).toThrow('--allowedHosts requires a comma-separated list');
  });

  it('parses --allowedOrigins as comma-separated list', () => {
    expect(parseArgs(['--http', '--allowedOrigins', 'http://localhost:5173,https://app.example.com'])).toEqual({
      ...defaults,
      http: true,
      allowedOrigins: ['http://localhost:5173', 'https://app.example.com'],
    });
  });

  it('throws when --allowedOrigins has no value', () => {
    expect(() => parseArgs(['--http', '--allowedOrigins'])).toThrow('--allowedOrigins requires a comma-separated list');
  });

  it('lists run_code only on --allow-code or WDIO_MCP_RUN_CODE', () => {
    expect(parseArgs([], {}).allowCode).toBe(false);
    expect(parseArgs(['--allow-code'], {}).allowCode).toBe(true);
    for (const value of ['1', 'true', 'TRUE']) expect(parseArgs([], { WDIO_MCP_RUN_CODE: value }).allowCode).toBe(true);
    for (const value of ['', '0', 'false', 'yes']) expect(parseArgs([], { WDIO_MCP_RUN_CODE: value }).allowCode).toBe(false);
  });

  it('listens on both loopback addresses unless --host names one', () => {
    expect(parseArgs(['--http']).hosts).toEqual(['127.0.0.1', '::1']);
    expect(parseArgs(['--http', '--host', '0.0.0.0']).hosts).toEqual(['0.0.0.0']);
  });

  it('throws when --host has no address', () => {
    expect(() => parseArgs(['--http', '--host'])).toThrow('--host requires an address');
    expect(() => parseArgs(['--http', '--host', '--port', '1'])).toThrow('--host requires an address');
  });
});
