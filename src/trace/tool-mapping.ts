export interface TraceAction {
  class: string;
  method: string;
  traceMethod: string;
}

const TOOL_MAP: Record<string, TraceAction> = {
  navigate: { class: 'Page', method: 'navigate', traceMethod: 'trace:page.navigate' },
  click_element: { class: 'Element', method: 'click', traceMethod: 'trace:element.click' },
  set_value: { class: 'Element', method: 'fill', traceMethod: 'trace:element.fill' },
  scroll: { class: 'Page', method: 'scroll', traceMethod: 'trace:page.scroll' },
  tap_element: { class: 'Element', method: 'tap', traceMethod: 'trace:element.tap' },
  swipe: { class: 'Page', method: 'swipe', traceMethod: 'trace:page.swipe' },
  drag_and_drop: { class: 'Element', method: 'dragTo', traceMethod: 'trace:element.dragTo' },
  execute_script: { class: 'Page', method: 'evaluate', traceMethod: 'trace:page.evaluate' },
  start_session: { class: 'Browser', method: 'newContext', traceMethod: 'trace:browser.newContext' },
  launch_chrome: { class: 'Browser', method: 'launch', traceMethod: 'trace:browser.launch' },
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

export function formatActionTitle(action: TraceAction, params: Record<string, unknown>): string {
  const { class: cls, method } = action;
  const firstKey = Object.keys(params)[0];
  const firstVal = Object.values(params)[0];
  if (firstVal === undefined) return `${cls}.${method}()`;

  const raw = String(firstVal);
  const label = firstKey === 'selector' ? extractSelectorLabel(raw) : raw;
  return `${cls}.${method}("${label.slice(0, 80)}")`;
}
