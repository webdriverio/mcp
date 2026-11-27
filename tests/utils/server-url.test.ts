import { describe, expect, it } from 'vitest';
import { serverUrl } from '../../src/utils/http-helpers';

describe('serverUrl', () => {
  it.each([
    [['127.0.0.1', '::1'], 'http://localhost:3000/mcp'],
    [['0.0.0.0'], 'http://localhost:3000/mcp'],
    [['::'], 'http://localhost:3000/mcp'],
    [['127.0.0.1'], 'http://127.0.0.1:3000/mcp'],
    [['::1'], 'http://[::1]:3000/mcp'],
    [['192.168.1.5'], 'http://192.168.1.5:3000/mcp'],
    [['fe80::1'], 'http://[fe80::1]:3000/mcp'],
    [['my-host.local'], 'http://my-host.local:3000/mcp'],
  ])('%j -> %s', (hosts, url) => {
    expect(serverUrl(hosts, 3000)).toBe(url);
  });
});
