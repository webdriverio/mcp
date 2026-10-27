import type { ZodRawShape } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition<T extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: T;
  annotations?: ToolAnnotations;
  /** Not bound to a session: skips the `session` target parameter and routing. */
  sessionless?: boolean;
}
