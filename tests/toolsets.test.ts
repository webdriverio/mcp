import { describe, expect, it } from 'vitest';
import { groupOf, showAllTools, toolAppliesTo } from '../src/toolsets';

describe('toolAppliesTo', () => {
  it('lists general tools everywhere', () => {
    for (const platform of [undefined, 'browser', 'electron', 'ios', 'android'] as const) {
      expect(toolAppliesTo('start_session', platform)).toBe(true);
      expect(toolAppliesTo('execute_script', platform)).toBe(true);
    }
  });

  it('lists mobile tools only for mobile sessions', () => {
    expect(toolAppliesTo('tap_element', undefined)).toBe(false);
    expect(toolAppliesTo('tap_element', 'browser')).toBe(false);
    expect(toolAppliesTo('tap_element', 'ios')).toBe(true);
    expect(toolAppliesTo('get_elements', 'android')).toBe(true);
  });

  it('lists the browser page tools before any session starts', () => {
    expect(toolAppliesTo('snapshot', undefined)).toBe(true);
    expect(toolAppliesTo('perform_actions', undefined)).toBe(true);
    expect(toolAppliesTo('get_elements', undefined)).toBe(false);
    expect(toolAppliesTo('snapshot', 'android')).toBe(false);
  });

  it('lists Electron tools only for Electron sessions', () => {
    expect(toolAppliesTo('execute_electron_script', 'browser')).toBe(false);
    expect(toolAppliesTo('execute_electron_script', 'electron')).toBe(true);
  });
});

describe('groupOf', () => {
  it('finds the group of an on-demand tool', () => {
    expect(groupOf('manage_mock')).toBe('mocks');
    expect(groupOf('set_cookie')).toBe('cookies');
    expect(groupOf('upload_app')).toBe('cloud-apps');
    expect(groupOf('click_element')).toBeUndefined();
  });
});

describe('showAllTools', () => {
  it('is on with WDIO_MCP_TOOLS=all', () => {
    expect(showAllTools({ WDIO_MCP_TOOLS: 'all' })).toBe(true);
    expect(showAllTools({})).toBe(false);
  });
});
