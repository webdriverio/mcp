import type { ZodRawShape } from 'zod';

/**
 * Definition for an MCP tool.
 * Used to register tools with the MCP server via registerTool().
 */
export interface ToolDefinition<T extends ZodRawShape = ZodRawShape> {
  /** The unique name of the tool (e.g., 'start_browser', 'navigate') */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Zod schema defining the tool's input parameters */
  inputSchema: T;
}
