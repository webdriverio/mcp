import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';
import { agentFor, errorResult, noSession, runAction, withActionTimeout } from '../session/agent';

/** larger snapshots are not returned; `find` narrows them down */
const MAX_CHARS = 12000;

export const snapshotToolDefinition: ToolDefinition = {
  name: 'snapshot',
  description: 'The page or app screen as an accessibility tree with refs, e.g. `button "Save" [ref=e3]`. Pass refs to perform_actions for several steps, or to click_element/set_value/select_option for one. Default: interactive elements only, plain text is dropped; full: true shows it. find returns only the parts of the page that contain the text (with their refs); full: true includes all text; viewport: true limits it to what is on screen (not together with find).',
  annotations: { title: 'Page Snapshot', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    find: z.string().optional().describe('Text to look for'),
    full: coerceBoolean.optional().default(false).describe('Include text, not just interactive elements'),
    scope: z.string().optional().describe('Only below this ref or selector'),
    viewport: coerceBoolean.optional().default(false).describe('Only what is on screen'),
  },
};

export const snapshotTool: ToolCallback = async ({ find, full = false, scope, viewport = false }: { find?: string; full?: boolean; scope?: string; viewport?: boolean }): Promise<CallToolResult> => {
  const agent = await agentFor();
  if (!agent) return noSession();
  if (find) {
    if (viewport) {
      return { isError: true, content: [{ type: 'text', text: 'find does not support viewport. Use find alone to search the whole page, or viewport without find.' }] };
    }
    return runAction(agent, 'find', { text: find, ...(scope && { scope }) }, `No match for ${JSON.stringify(find)}.`);
  }
  try {
    const snapshot = await withActionTimeout(agent.snapshot({ interactive: !full, scope, viewport, maxChars: MAX_CHARS }), 'snapshot');
    return { content: [{ type: 'text', text: [snapshot.text, ...(snapshot.notes ?? [])].join('\n') }] };
  } catch (e) {
    return errorResult(e);
  }
};
