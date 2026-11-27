import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startSessionToolDefinition } from '../../src/tools/session.tool';

const START_SESSION_SERIALIZED_MAX_CHARS = 4800;

describe('start_session tools/list payload', () => {
  it('keeps description and inputSchema within the serialized size bound', async () => {
    const server = new McpServer({ name: 'size-test', version: '1.0.0' });
    server.registerTool(startSessionToolDefinition.name, {
      description: startSessionToolDefinition.description,
      inputSchema: startSessionToolDefinition.inputSchema,
    }, async () => ({ content: [] }));
    const client = new Client({ name: 'size-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === startSessionToolDefinition.name);
      const size = JSON.stringify({ description: tool?.description, inputSchema: tool?.inputSchema }).length;
      expect(size).toBeLessThanOrEqual(START_SESSION_SERIALIZED_MAX_CHARS);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
