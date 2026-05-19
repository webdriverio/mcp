import { describe, expect, it } from 'vitest';
import { mapToolToTraceAction, formatActionTitle } from '../../src/trace/tool-mapping';

describe('mapToolToTraceAction', () => {
  it('maps navigate to Page.navigate', () => {
    expect(mapToolToTraceAction('navigate')).toEqual({
      class: 'Page',
      method: 'navigate',
    });
  });

  it('maps click_element to Element.click', () => {
    expect(mapToolToTraceAction('click_element')).toEqual({
      class: 'Element',
      method: 'click',
    });
  });

  it('maps set_value to Element.fill', () => {
    const action = mapToolToTraceAction('set_value');
    expect(action?.class).toBe('Element');
    expect(action?.method).toBe('fill');
  });

  it('maps all expected tools without returning null', () => {
    const mapped = ['navigate', 'click_element', 'set_value', 'scroll', 'tap_element', 'swipe', 'drag_and_drop', 'execute_script', 'launch_chrome'];
    for (const tool of mapped) {
      expect(mapToolToTraceAction(tool), `expected ${tool} to be mapped`).not.toBeNull();
    }
  });

  it('returns null for unmapped tools', () => {
    expect(mapToolToTraceAction('get_elements')).toBeNull();
    expect(mapToolToTraceAction('get_screenshot')).toBeNull();
    expect(mapToolToTraceAction('unknown_tool')).toBeNull();
  });
});

describe('formatActionTitle', () => {
  it('includes first param in title', () => {
    const action = { class: 'Page', method: 'navigate' };
    expect(formatActionTitle(action, { url: 'https://example.com' })).toBe('Page.navigate("https://example.com")');
  });

  it('truncates long params to 80 chars', () => {
    const action = { class: 'Page', method: 'evaluate' };
    const longScript = 'a'.repeat(100);
    const title = formatActionTitle(action, { script: longScript });
    expect(title.length).toBeLessThan(100);
  });

  it('omits parens content when no params', () => {
    const action = { class: 'Browser', method: 'launch' };
    expect(formatActionTitle(action, {})).toBe('Browser.launch()');
  });
});
