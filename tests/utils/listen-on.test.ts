import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listenOn } from '../../src/utils/http-helpers';

const handle: http.RequestListener = (_req, res) => res.end('ok');
const open: http.Server[] = [];
const addresses = (servers: http.Server[]) => servers.map((server) => (server.address() as AddressInfo).address);

async function freePort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('listenOn', () => {
  it('listens only on the addresses it is given', async () => {
    const servers = await listenOn(['127.0.0.1'], await freePort(), handle);
    open.push(...servers);
    expect(addresses(servers)).toEqual(['127.0.0.1']);
  });

  it('skips an address the machine does not have while another listens', async () => {
    // 192.0.2.0/24 is reserved for documentation, so no interface carries 192.0.2.123
    const servers = await listenOn(['127.0.0.1', '192.0.2.123'], await freePort(), handle);
    open.push(...servers);
    expect(addresses(servers)).toEqual(['127.0.0.1']);
  });

  it('rejects when the only address is missing', async () => {
    await expect(listenOn(['192.0.2.123'], await freePort(), handle)).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' });
  });

  it('rejects on a port in use instead of skipping it', async () => {
    const port = await freePort();
    open.push(...await listenOn(['127.0.0.1'], port, handle));
    await expect(listenOn(['127.0.0.1', '::1'], port, handle)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
