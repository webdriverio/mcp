import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser, getState } from '../session/state';

export const executeElectronScriptToolDefinition: ToolDefinition = {
  name: 'execute_electron_script',
  description: 'Executes arbitrary JavaScript in the Electron main process. This is privileged code execution with access to Electron APIs; use only with trusted scripts.',
  annotations: { title: 'Execute Electron Main-Process Script', destructiveHint: true },
  inputSchema: {
    script: z.string().min(1).describe('JavaScript body executed in the Electron main process. Use `electron` for Electron APIs, `args` for supplied values, and `return` for a result.'),
    args: z.array(z.unknown()).optional().describe('Values made available to the script as args[0], args[1], and so on.'),
  },
};

export const executeElectronScriptTool: ToolCallback = async (args: { script: string; args?: unknown[] }): Promise<CallToolResult> => {
  try {
    const state = getState();
    const metadata = state.currentSession ? state.sessionMetadata.get(state.currentSession) : undefined;
    if (metadata?.runtime !== 'electron') {
      return { isError: true, content: [{ type: 'text', text: 'Error executing Electron script: no active Electron session.' }] };
    }
    const browser = getBrowser() as WebdriverIO.Browser & { electron?: { execute: (fn: unknown, ...values: unknown[]) => Promise<unknown> } };
    if (!browser.electron?.execute) {
      return { isError: true, content: [{ type: 'text', text: 'Error executing Electron script: Electron main-process bridge is unavailable.' }] };
    }
    const result = await browser.electron.execute(
      (electron: unknown, source: string, values: unknown[]) => new Function('electron', 'args', source)(electron, values),
      args.script,
      args.args ?? [],
    );
    return { content: [{ type: 'text', text: result === undefined ? 'Electron script executed successfully (no return value)' : `Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}` }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `Error executing Electron script: ${error instanceof Error ? error.message : String(error)}` }] };
  }
};
