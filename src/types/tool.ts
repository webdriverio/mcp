import type { ZodType } from 'zod';
import type { CallToolResult, ToolAnnotations, ToolCallback } from '@modelcontextprotocol/server';

// zod's own ZodRawShape is the core $ZodShape; the SDK's registerTool needs classic ZodType values
type ZodRawShape = Record<string, ZodType>;

// Wrappers cast to this because only legacy-protocol (2025-11-25) results are produced. An InputRequiredResult (2026-07-28 era, #222) has no content and must be handled before that era is enabled.
export type ToolResult = Extract<Awaited<ReturnType<ToolCallback>>, CallToolResult>;

export interface ToolDefinition<T extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: T;
  annotations?: ToolAnnotations;
  /** Not bound to a session: skips the `session` target parameter and routing. */
  sessionless?: boolean;
  /** Runs outside the per-session queue so it can act on a session whose command is hung. */
  unqueued?: boolean;
}
