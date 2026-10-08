import { beforeEach, describe, expect, it } from 'vitest';
import { getState } from '../../src/session/state';
import { clickTool, clickToolDefinition } from '../../src/tools/click.tool';
import { setValueTool, setValueToolDefinition } from '../../src/tools/set-value.tool';

type Result = { content: { text: string }[]; isError?: boolean };
const call = (tool: unknown, args: Record<string, unknown>) => (tool as (a: Record<string, unknown>) => Promise<Result>)(args);

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
});

describe('click_element and set_value', () => {
  it('no longer take the unused timeout and scrollToView params', () => {
    expect(Object.keys(clickToolDefinition.inputSchema)).toEqual(['selector']);
    expect(Object.keys(setValueToolDefinition.inputSchema)).toEqual(['selector', 'value']);
  });

  it('answer with the no-session error when no session is active', async () => {
    for (const result of [await call(clickTool, { selector: '#a' }), await call(setValueTool, { selector: '#a', value: 'x' })]) {
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('No active session. Start one with start_session.');
    }
  });
});
