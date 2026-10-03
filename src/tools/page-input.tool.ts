import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { runAction, webAgent } from '../session/agent';

const browserOnly = (): CallToolResult => ({ isError: true, content: [{ type: 'text', text: 'Only available in browser sessions.' }] });

export const selectOptionToolDefinition: ToolDefinition = {
  name: 'select_option',
  description: 'Selects an option of a <select> by its text. The result lists what changed on the page.',
  annotations: { title: 'Select Option', destructiveHint: false },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector of the <select>'),
    value: z.string().describe('Option text'),
  },
};

export const selectOptionTool: ToolCallback = async ({ selector, value }: { selector: string; value: string }) => {
  const agent = await webAgent();
  return agent ? runAction(agent, 'select', { target: selector, value }, `Selected ${JSON.stringify(value)}.`) : browserOnly();
};

export const pressKeyToolDefinition: ToolDefinition = {
  name: 'press_key',
  description: 'Presses a key or combination in the focused element, e.g. Enter, Tab, Escape, Control+a. The result lists what changed on the page.',
  annotations: { title: 'Press Key', destructiveHint: false },
  inputSchema: {
    keys: z.string().describe('Key or combination'),
  },
};

export const pressKeyTool: ToolCallback = async ({ keys }: { keys: string }) => {
  const agent = await webAgent();
  return agent ? runAction(agent, 'press', { keys }, `Pressed ${keys}.`) : browserOnly();
};
