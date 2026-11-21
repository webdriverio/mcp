import { describe, expect, it } from 'vitest';
import { clientLine, initializeClientInfo } from '../../src/utils/client-info';

describe('clientLine', () => {
  it('names the client and its version', () => {
    expect(clientLine({ name: 'claude-code', version: '2.1.300' })).toBe('MCP client: claude-code 2.1.300');
  });

  it('says unknown when the client sent no usable name', () => {
    expect(clientLine(undefined)).toBe('MCP client: unknown');
    expect(clientLine({ name: 42, version: '1.0' })).toBe('MCP client: unknown 1.0');
  });

  it('keeps one line: control characters dropped, length capped', () => {
    expect(clientLine({ name: 'evil\n[ERROR] fake\u001b[31m', version: '1' })).toBe('MCP client: evil[ERROR] fake[31m 1');
    expect(clientLine({ name: 'x'.repeat(500) }).length).toBe('MCP client: '.length + 100);
  });
});

describe('initializeClientInfo', () => {
  it('reads clientInfo from an initialize request only', () => {
    expect(initializeClientInfo({ method: 'initialize', params: { clientInfo: { name: 'cursor' } } })).toEqual({ name: 'cursor' });
    expect(initializeClientInfo({ method: 'tools/list' })).toBeUndefined();
    expect(initializeClientInfo(undefined)).toBeUndefined();
  });

  it('still reports an initialize request without clientInfo', () => {
    expect(clientLine(initializeClientInfo({ method: 'initialize', params: {} }))).toBe('MCP client: unknown');
  });
});
