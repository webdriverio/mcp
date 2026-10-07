import type { RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from './types/tool';
import { getToolSettings, onSessionRegistered, platformOf } from './session/state';
import { groupOf, GROUPS, toolAppliesTo, showAllTools, type ToolGroup } from './toolsets';
import { enableToolsToolDefinition } from './tools/enable-tools.tool';

const refreshers = new Set<() => void>();
let listening = false;

// one listener for the process, not one per server: HTTP mode builds a server per request
function listenOnce(): void {
  if (listening) return;
  listening = true;
  onSessionRegistered((metadata) => {
    getToolSettings().platform = platformOf(metadata);
    for (const refresh of refreshers) refresh();
  });
}

/**
 * Every tool definition is sent with every model request. Tools that only
 * work on mobile or Electron sessions stay hidden until such a session
 * starts, so a browser session doesn't pay for them on every turn.
 * Returns a function that detaches the server again.
 */
export function setupToolVisibility(
  tools: Map<string, RegisteredTool>,
  registerTool: (definition: ToolDefinition, callback: ToolCallback) => RegisteredTool,
): () => void {
  if (showAllTools()) return () => {};
  const refresh = () => {
    const { platform, enabledGroups } = getToolSettings();
    for (const [name, tool] of tools) {
      const group = groupOf(name);
      const listed = toolAppliesTo(name, platform) && (!group || enabledGroups.has(group));
      if (listed && !tool.enabled) tool.enable();
      if (!listed && tool.enabled) tool.disable();
    }
  };
  registerTool(enableToolsToolDefinition, async ({ groups }: { groups: ToolGroup[] }) => {
    groups.forEach((group) => getToolSettings().enabledGroups.add(group));
    refresh();
    const added = groups.flatMap((group) => GROUPS[group].tools).filter((name) => tools.get(name)?.enabled);
    return { content: [{ type: 'text', text: added.length ? `Added: ${added.join(', ')}` : 'None of these tools apply to the current session.' }] };
  });
  refresh();
  listenOnce();
  refreshers.add(refresh);
  return () => refreshers.delete(refresh);
}
