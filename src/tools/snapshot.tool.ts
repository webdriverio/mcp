import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';
import { agentFor, errorResult, noSession, runAction, withActionTimeout } from '../session/agent';
import {
  resolveOutputMode,
  summarizeSnapshot,
  writeSessionOutputFile,
  type OutputMode,
} from '../utils/file-output';

/** larger snapshots are not returned inline; `find` narrows them down or `outputMode: 'file'` writes them to disk */
const MAX_CHARS = 12000;
const outputModeEnum = z.enum(['inline', 'file']);

export const snapshotToolDefinition: ToolDefinition = {
  name: 'snapshot',
  description: 'The page or app screen as an accessibility tree with refs, e.g. `button "Save" [ref=e3]`. Pass refs to perform_actions for several steps, or to click_element/set_value/select_option for one. Default: interactive elements only, plain text is dropped; full: true shows it. find returns only the parts of the page that contain the text (with their refs); full: true includes all text; viewport: true limits it to what is on screen (not together with find). Pass outputMode: "file" to write large snapshots to a temp file and return its path + summary.',
  annotations: { title: 'Page Snapshot', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    find: z.string().optional().describe('Text to look for'),
    full: coerceBoolean.optional().default(false).describe('Include text, not just interactive elements'),
    scope: z.string().optional().describe('Only below this ref or selector'),
    viewport: coerceBoolean.optional().default(false).describe('Only what is on screen'),
    outputMode: outputModeEnum.optional().describe('Return snapshot inline (default, or WDIO_MCP_OUTPUT_MODE) or write to a temp file and return its path + summary'),
    outputDir: z.string().min(1).optional().describe('Directory for outputMode: "file" (defaults to WDIO_MCP_OUTPUT_DIR or OS temp dir)'),
  },
};

type SnapshotToolArgs = {
  find?: string;
  full?: boolean;
  scope?: string;
  viewport?: boolean;
  outputMode?: OutputMode;
  outputDir?: string;
};

export function createSnapshotTool(defaultOutputMode?: OutputMode): ToolCallback {
  return async ({
    find,
    full = false,
    scope,
    viewport = false,
    outputMode,
    outputDir,
  }: SnapshotToolArgs): Promise<CallToolResult> => {
    const agent = await agentFor();
    if (!agent) return noSession();

    let effectiveOutputMode: OutputMode;
    try {
      effectiveOutputMode = resolveOutputMode(outputMode, defaultOutputMode);
    } catch (e) {
      return errorResult(e);
    }

    if (find) {
      if (viewport) {
        return { isError: true, content: [{ type: 'text', text: 'find does not support viewport. Use find alone to search the whole page, or viewport without find.' }] };
      }
      const result = await runAction(agent, 'find', { text: find, ...(scope && { scope }) }, `No match for ${JSON.stringify(find)}.`);
      if (effectiveOutputMode === 'file' && !result.isError) {
        try {
          const text = (result.content ?? [])
            .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
            .map(item => item.text)
            .join('\n');
          const { filePath, bytes, lines } = writeSessionOutputFile({
            kind: 'snapshot-find',
            content: text,
            ext: 'txt',
            outputDir,
          });
          const { root, refCount } = summarizeSnapshot(text);
          return {
            content: [{
              type: 'text',
              text: `Snapshot written to ${filePath} (root: ${root}, ${refCount} refs, ${lines} lines, ${bytes} bytes)`,
            }],
          };
        } catch (e) {
          return errorResult(e);
        }
      }
      return result;
    }

    try {
      const snapshot = await withActionTimeout(
        agent.snapshot({
          interactive: !full,
          scope,
          viewport,
          ...(effectiveOutputMode === 'inline' && { maxChars: MAX_CHARS }),
        }),
        'snapshot',
      );
      const text = [snapshot.text, ...(snapshot.notes ?? [])].join('\n');
      if (effectiveOutputMode === 'file') {
        const { filePath, bytes, lines } = writeSessionOutputFile({
          kind: 'snapshot',
          content: text,
          ext: 'txt',
          outputDir,
        });
        const { root, refCount } = summarizeSnapshot(snapshot.text);
        return {
          content: [{
            type: 'text',
            text: `Snapshot written to ${filePath} (root: ${root}, ${refCount} refs, ${lines} lines, ${bytes} bytes)`,
          }],
        };
      }
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return errorResult(e);
    }
  };
}

export const snapshotTool: ToolCallback = createSnapshotTool();
