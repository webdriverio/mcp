import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getState } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';

const run = vi.fn();
vi.mock('@wdio/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSession: vi.fn(async () => ({ run })),
}));

const { withRecording } = await import('../../src/recording/step-recorder');
const { generateCode } = await import('../../src/recording/code-generator');
const { clickTool } = await import('../../src/tools/click.tool');
const { performActionsTool, selectOptionTool, pressKeyTool } = await import('../../src/tools/page-input.tool');

const extra = {} as Parameters<ToolCallback>[1];
const record = (name: string, tool: unknown, params: Record<string, unknown>) => (withRecording(name, tool as ToolCallback) as unknown as (p: unknown, e: unknown) => Promise<unknown>)(params, extra);

let history: SessionHistory;
beforeEach(() => {
  run.mockReset();
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.browsers.set('s1', {} as WebdriverIO.Browser);
  state.currentSession = 's1';
  state.sessionMetadata.set('s1', { type: 'browser', capabilities: {}, isAttached: false });
  history = { sessionId: 's1', type: 'browser', startedAt: '2026-01-01T00:00:00.000Z', capabilities: {}, steps: [] };
  state.sessionHistory.set('s1', history);
});

describe('recording the code the agent ran', () => {
  it('a click on a ref replays as the agent selector code', async () => {
    run.mockResolvedValue({ text: 'Clicked e4', code: "await $('role/button[name=\"Save\"]').click()" });
    await record('click_element', clickTool, { selector: 'e4' });
    expect(history.steps[0].code).toEqual(["await $('role/button[name=\"Save\"]').click()"]);
    const script = generateCode(history);
    expect(script).toContain("await $('role/button[name=\"Save\"]').click()");
    expect(script).not.toContain("'e4'");
  });

  it('perform_actions records the completed steps before a failure', async () => {
    run
      .mockResolvedValueOnce({ text: 'ok', code: "await $('#a').setValue('x')" })
      .mockResolvedValueOnce({ text: 'ok', code: "await $('#b').click()" })
      .mockRejectedValueOnce(new Error('not found'));
    await record('perform_actions', performActionsTool, { actions: [
      { action: 'fill', selector: 'e1', value: 'x' },
      { action: 'click', selector: 'e2' },
      { action: 'click', selector: 'e3' },
    ] });
    expect(history.steps[0].status).toBe('error');
    expect(history.steps[0].code).toEqual(["await $('#a').setValue('x')", "await $('#b').click()"]);
  });

  it('select_option and press_key produce real code', async () => {
    run.mockResolvedValueOnce({ text: 'ok', code: "await $('#c').selectByVisibleText('Red')" }).mockResolvedValueOnce({ text: 'ok', code: "await browser.keys('Enter')" });
    await record('select_option', selectOptionTool, { selector: 'e2', value: 'Red' });
    await record('press_key', pressKeyTool, { keys: 'Enter' });
    const script = generateCode(history);
    expect(script).toContain("selectByVisibleText('Red')");
    expect(script).toContain("browser.keys('Enter')");
    expect(script).not.toContain('[unknown tool]');
  });
});
