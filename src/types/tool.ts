import type { ZodRawShape } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

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
