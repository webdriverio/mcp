import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { SessionError } from '@wdio/session/agent';
import { getBrowser } from '../session/state';
import { errorResult, withActionTimeout } from '../session/agent';
import { noteTabSelected } from '../session/tab-selection';

export const switchTabToolDefinition: ToolDefinition = {
  name: 'switch_tab',
  description: 'Switches to a tab by handle or 0-based index (see get_tabs). Later tools act on that tab.',
  annotations: { title: 'Switch Browser Tab', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    handle: z.string().optional().describe('Window handle to switch to'),
    index: z.number().int().min(0).optional().describe('0-based tab index to switch to'),
  },
};

async function switchTab(handle?: string, index?: number): Promise<CallToolResult> {
  const browser = getBrowser();
  if (handle) {
    noteTabSelected(browser);
    await browser.switchToWindow(handle);
    return { content: [{ type: 'text', text: `Switched to tab: ${handle}` }] };
  } else if (index !== undefined) {
    const handles = await browser.getWindowHandles();
    if (index >= handles.length) {
      return { isError: true, content: [{ type: 'text', text: `Error: index ${index} out of range (${handles.length} tabs)` }] };
    }
    noteTabSelected(browser);
    await browser.switchToWindow(handles[index]);
    return { content: [{ type: 'text', text: `Switched to tab ${index}: ${handles[index]}` }] };
  }
  return { isError: true, content: [{ type: 'text', text: 'Error: Must provide either handle or index' }] };
}

export const switchTabTool: ToolCallback = async ({ handle, index }: { handle?: string; index?: number }): Promise<CallToolResult> => {
  try {
    return await withActionTimeout(switchTab(handle, index), 'switch_tab');
  } catch (e) {
    const failed = errorResult(e, 'Error switching tab');
    if (!(e instanceof SessionError && e.code === 'TIMEOUT')) return failed;
    const [{ text }] = failed.content as { text: string }[];
    return { isError: true, content: [{ type: 'text', text: `${text}\nThe switch may still land, so the active tab is unknown: call get_tabs.` }] };
  }
};
