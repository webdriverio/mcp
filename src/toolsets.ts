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

/**
 * Tools most sessions never call. Their definitions would still be sent with
 * every model request, so they are listed once an agent asks for their
 * group through `enable_tools`.
 */
export const GROUPS = {
  mocks: { tools: ['mock', 'get_mock_calls', 'manage_mock'], desc: 'mock network requests or Electron APIs' },
  cookies: { tools: ['get_cookies', 'set_cookie', 'delete_cookies'], desc: 'read, set and delete cookies' },
  device: { tools: ['emulate_device', 'set_geolocation'], desc: 'emulate a phone or tablet, fake the location' },
  extensions: { tools: ['open_web_extension'], desc: 'install and open a browser extension' },
  attach: { tools: ['launch_chrome', 'attach_session'], desc: 'launch Chrome with remote debugging, attach to a running WebDriver or Appium session' },
  'cloud-apps': { tools: ['list_apps', 'upload_app'], desc: 'upload and list mobile apps on BrowserStack, Sauce Labs, TestMu, TestingBot, Digital.ai' },
} as const;

export type ToolGroup = keyof typeof GROUPS;

export function groupOf(name: string): ToolGroup | undefined {
  return (Object.keys(GROUPS) as ToolGroup[]).find((group) => (GROUPS[group].tools as readonly string[]).includes(name));
}

/** `WDIO_MCP_TOOLS=all` lists every tool from the start, for clients that ignore tool list changes */
export function showAllTools(env = process.env): boolean {
  return env.WDIO_MCP_TOOLS === 'all';
}
