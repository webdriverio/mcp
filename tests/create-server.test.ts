import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_INSTRUCTIONS } from '../src/create-server';
import { GROUPS } from '../src/toolsets';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function connect(clientName: string) {
  const server = createServer('none', { detectClient: true });
  const client = new Client({ name: clientName, version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

async function listedTools(clientName: string): Promise<string[]> {
  const { client, close } = await connect(clientName);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await close();
  }
}

describe('SERVER_INSTRUCTIONS', () => {
  it('stays within 4096 characters', () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(4096);
  });

  it('states the hidden-group rule in client-neutral wording', () => {
    expect(SERVER_INSTRUCTIONS).toContain('Groups below are hidden by default; if enable_tools is listed, call it with the group name:');
    expect(SERVER_INSTRUCTIONS).not.toMatch(/call enable_tools/);
  });

  it('names only tools, groups and resources that are registered', async () => {
    const registered = new Set([...await listedTools('claude-code'), 'enable_tools']);
    const referenced = [...SERVER_INSTRUCTIONS.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const unknown = referenced.filter((name) => !registered.has(name) && !(name in GROUPS) && !name.startsWith('wdio://'));
    expect(unknown).toEqual([]);
  });

  it('maps every hidden group and its tools', () => {
    for (const [group, { tools }] of Object.entries(GROUPS)) {
      expect(SERVER_INSTRUCTIONS).toContain(`\`${group}\``);
      for (const tool of tools) expect(SERVER_INSTRUCTIONS).toContain(`\`${tool}\``);
    }
  });

  it('is sent to the client on initialize', async () => {
    const { client, close } = await connect('cursor');
    try {
      expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    } finally {
      await close();
    }
  });
});

describe('tool listing after initialize', () => {
  it('already lists every tool, without enable_tools, on the first tools/list for claude-code', async () => {
    const { client, close } = await connect('claude-code');
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toContain('enable_tools');
      expect(names).toEqual(expect.arrayContaining(['mock', 'get_cookies', 'tap_element']));
    } finally {
      await close();
    }
  });

  it('keeps the hidden groups for claude-code when WDIO_MCP_TOOLS=gated', async () => {
    vi.stubEnv('WDIO_MCP_TOOLS', 'gated');
    const names = await listedTools('claude-code');
    expect(names).toContain('enable_tools');
    expect(names).not.toContain('get_cookies');
  });

  it('keeps the hidden groups for another client', async () => {
    const names = await listedTools('cursor');
    expect(names).toContain('enable_tools');
    expect(names).not.toContain('get_cookies');
    expect(names).not.toContain('tap_element');
  });

  it('keeps the hidden groups without client detection (HTTP)', async () => {
    const server = createServer('none');
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('enable_tools');
      expect(names).not.toContain('get_cookies');
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
