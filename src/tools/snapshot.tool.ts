import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';
import { forMcp, runAction, webAgent } from '../session/agent';

/** larger snapshots are not returned; `find` narrows them down */
const MAX_CHARS = 12000;

export const snapshotToolDefinition: ToolDefinition = {
  name: 'snapshot',
  description: 'The page as an accessibility tree with refs, e.g. `button "Save" [ref=e3]`. Pass refs as the selector of click_element, set_value and select_option. Default: interactive elements only. find returns only the parts of the page that contain the text (with their refs); full: true includes all text.',
  annotations: { title: 'Page Snapshot', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    find: z.string().optional().describe('Text to look for'),
    full: coerceBoolean.optional().default(false).describe('Include text, not just interactive elements'),
    scope: z.string().optional().describe('Only below this ref or selector'),
  },
};

export const snapshotTool: ToolCallback = async ({ find, full = false, scope }: { find?: string; full?: boolean; scope?: string }): Promise<CallToolResult> => {
  const agent = await webAgent();
  if (!agent) {
    return { isError: true, content: [{ type: 'text', text: 'snapshot works in browser sessions; use get_elements for apps.' }] };
  }
  if (find) {
    return runAction(agent, 'find', { text: find, ...(scope && { scope }) }, `No match for ${JSON.stringify(find)}.`);
  }
  const result = await runAction(agent, 'snapshot', { interactive: !full, scope, maxChars: MAX_CHARS }, '');
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
  if (!result.isError && text.startsWith('Snapshot: ')) {
    const size = text.split('\n')[0].replace(/ →.*$/, '');
    return { content: [{ type: 'text', text: forMcp(`${size}: too big to return. Use \`find\` with text you expect near what you need, or \`scope\`.`) }] };
  }
  return result;
};
