import type { ToolCallback, CallToolResult } from '@modelcontextprotocol/server';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateCode } from '../recording/code-generator';
import { activeSessionId } from '../session/context';
import { getState } from '../session/state';
import { coerceBoolean } from '../utils/zod-helpers';

export const saveCodeToolDefinition: ToolDefinition = {
  name: 'save_code',
  description: 'Writes the WebdriverIO code generated for the session named by the session argument, or the default session if none is given, to a file. Under --http the path is on the server\'s disk, not the client\'s.',
  inputSchema: {
    path: z.string().describe('File to write. Relative paths resolve against the server working directory.'),
    overwrite: coerceBoolean.optional().describe('Replace the file if it already exists (default: false).'),
  },
};

export const saveCodeTool: ToolCallback = async ({ path, overwrite }: { path: string; overwrite?: boolean }): Promise<CallToolResult> => {
  const sessionId = activeSessionId();
  const history = sessionId ? getState().sessionHistory.get(sessionId) : undefined;
  if (!history) return { isError: true, content: [{ type: 'text', text: 'Error: No active session to save code from.' }] };

  const target = resolve(process.cwd(), path);
  const code = generateCode(history);
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, code, { flag: overwrite ? 'w' : 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      return { isError: true, content: [{ type: 'text', text: `Error: ${target} already exists. Pass overwrite: true to replace it.` }] };
    }
    return { isError: true, content: [{ type: 'text', text: `Error: ${e}` }] };
  }
  return { content: [{ type: 'text', text: `Saved ${history.steps.length} steps (${code.split('\n').length} lines) to ${target}` }] };
};
