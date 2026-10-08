import { z } from 'zod';
import type { ToolDefinition } from '../types/tool';
import { GROUPS, type ToolGroup } from '../toolsets';

const groups = Object.keys(GROUPS) as [ToolGroup, ...ToolGroup[]];

export const enableToolsToolDefinition: ToolDefinition = {
  name: 'enable_tools',
  description: `Adds more tools: ${groups.map((group) => `${group} (${GROUPS[group].desc})`).join('; ')}.`,
  annotations: { title: 'Enable Tools', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    groups: z.array(z.enum(groups)).min(1),
  },
};
