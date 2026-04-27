import type { ZodRawShape } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition<T extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: T;
  annotations?: ToolAnnotations;
}
