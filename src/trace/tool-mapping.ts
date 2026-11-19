export interface TraceAction {
  class: string;
  method: string;
}

const TOOL_MAP: Record<string, TraceAction> = {
  navigate: { class: 'Page', method: 'navigate' },
  click_element: { class: 'Element', method: 'click' },
  set_value: { class: 'Element', method: 'fill' },
  scroll: { class: 'Page', method: 'scroll' },
  tap_element: { class: 'Element', method: 'tap' },
  swipe: { class: 'Page', method: 'swipe' },
  drag_and_drop: { class: 'Element', method: 'dragTo' },
  execute_script: { class: 'Page', method: 'evaluate' },
  execute_electron_script: { class: 'Electron', method: 'execute' },
  mock: { class: 'Mock', method: 'configure' },
  get_mock_calls: { class: 'Mock', method: 'calls' },
  manage_mock: { class: 'Mock', method: 'manage' },
  trigger_electron_deeplink: { class: 'Electron', method: 'triggerDeeplink' },
  launch_chrome: { class: 'Browser', method: 'launch' },
  open_web_extension: { class: 'Page', method: 'navigate' },
  hide_keyboard: { class: 'Device', method: 'hideKeyboard' },
  rotate_device: { class: 'Device', method: 'rotate' },
  switch_context: { class: 'Context', method: 'switch' },
  press_key: { class: 'Keyboard', method: 'press' },
  select_option: { class: 'Element', method: 'selectOption' },
  set_geolocation: { class: 'Device', method: 'setGeolocation' },
  perform_actions: { class: 'Page', method: 'performActions' },
};

export function mapToolToTraceAction(toolName: string): TraceAction | null {
  return TOOL_MAP[toolName] ?? null;
}

function extractSelectorLabel(selector: string): string {
  // UiAutomator: android=new UiSelector().text("Label") or .description("Label")
  const uiautomator = selector.match(/\.(?:text|description|textContains)\("([^"]+)"\)/);
  if (uiautomator) return uiautomator[1];

  // Accessibility ID: ~label
  if (selector.startsWith('~')) return selector.slice(1);

  // iOS predicate: -ios predicate string:label == "X" or name == "X"
  const predicate = selector.match(/(?:label|name|value)\s*==\s*"([^"]+)"/);
  if (predicate) return predicate[1];

  // XPath attribute: [@text="X"] [@label="X"] [@name="X"] [@content-desc="X"]
  const xpath = selector.match(/@(?:text|label|name|content-desc)="([^"]+)"/);
  if (xpath) return xpath[1];

  return selector;
}

function formatActionsSummary(actions: unknown): string {
  if (!Array.isArray(actions)) return String(actions);
  return actions
    .map((s) => {
      const step = s as Record<string, unknown>;
      const target = step.selector ?? step.value ?? '';
      return `${String(step.action)}${target ? ` ${target}` : ''}`;
    })
    .join(', ');
}

export function formatActionTitle(action: TraceAction, params: Record<string, unknown>): string {
  const { class: cls, method } = action;
  const firstKey = Object.keys(params)[0];
  const firstVal = Object.values(params)[0];
  if (firstVal === undefined) return `${cls}.${method}()`;
  if (firstKey === 'actions') {
    return `${cls}.${method}("${formatActionsSummary(firstVal).slice(0, 80)}")`;
  }

  const raw = String(firstVal);
  const label = firstKey === 'selector' ? extractSelectorLabel(raw) : raw;
  return `${cls}.${method}("${label.slice(0, 80)}")`;
}
