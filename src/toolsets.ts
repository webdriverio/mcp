export type ToolPlatform = 'browser' | 'electron' | 'ios' | 'android';

/**
 * Tools that only make sense on some platforms. Everything else is always
 * listed.
 */
const ONLY: Record<string, ToolPlatform[]> = {
  tap_element: ['ios', 'android'],
  swipe: ['ios', 'android'],
  drag_and_drop: ['ios', 'android'],
  switch_context: ['ios', 'android'],
  get_contexts: ['ios', 'android'],
  rotate_device: ['ios', 'android'],
  hide_keyboard: ['ios', 'android'],
  get_app_state: ['ios', 'android'],
  execute_electron_script: ['electron'],
  // browsers use snapshot, select_option and press_key instead
  get_elements: ['ios', 'android', 'electron'],
  get_accessibility_tree: ['electron'],
  snapshot: ['browser'],
  select_option: ['browser'],
  press_key: ['browser'],
  trigger_electron_deeplink: ['electron'],
};

/** whether a tool is listed while a session of `platform` (or none) is active */
export function toolAppliesTo(name: string, platform: ToolPlatform | undefined): boolean {
  const only = ONLY[name];
  // before a session starts, list what a browser session gets
  return !only || only.includes(platform ?? 'browser');
}

/** `WDIO_MCP_TOOLS=all` lists every tool from the start, for clients that ignore tool list changes */
export function showAllTools(env = process.env): boolean {
  return env.WDIO_MCP_TOOLS === 'all';
}
