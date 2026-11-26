import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getState } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';

const run = vi.fn();
vi.mock('@wdio/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSession: vi.fn(async () => ({ run, session: { isWeb: true }, actions: ['click', 'fill', 'select', 'check', 'uncheck', 'press'].map((name) => ({ name })) })),
}));

const { withRecording } = await import('../../src/recording/step-recorder');
const { generateCode } = await import('../../src/recording/code-generator');
const { buildCurrentSessionSteps } = await import('../../src/resources/sessions.resource');
const { clickTool } = await import('../../src/tools/click.tool');
const { performActionsTool, selectOptionTool, pressKeyTool } = await import('../../src/tools/page-input.tool');
const { setCookieTool, deleteCookiesTool } = await import('../../src/tools/cookies.tool');
const { switchTabTool } = await import('../../src/tools/tabs.tool');
const { emulateDeviceTool } = await import('../../src/tools/emulate-device.tool');

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

  it('set_cookie and delete_cookies record the agent cookie code', async () => {
    run
      .mockResolvedValueOnce({ text: '', code: "await browser.setCookies({ name: 'session', value: 'abc', path: '/' })" })
      .mockResolvedValueOnce({ text: '', code: "await browser.deleteCookies('session')" });
    await record('set_cookie', setCookieTool, { name: 'session', value: 'abc' });
    await record('delete_cookies', deleteCookiesTool, { name: 'session' });
    expect(history.steps.map(step => step.code)).toEqual([
      ["await browser.setCookies({ name: 'session', value: 'abc', path: '/' })"],
      ["await browser.deleteCookies('session')"],
    ]);
  });

  it('switch_tab and emulate_device appear in session steps and generated code when recorded', async () => {
    const restoreFn = vi.fn().mockResolvedValue(undefined);
    getState().browsers.set('s1', {
      isBidi: true,
      getWindowHandles: vi.fn().mockResolvedValue(['tab-0', 'tab-1']),
      switchToWindow: vi.fn().mockResolvedValue(undefined),
      emulate: vi.fn().mockResolvedValue(restoreFn),
    } as unknown as WebdriverIO.Browser);

    await record('switch_tab', switchTabTool, { index: 1 });
    await record('emulate_device', emulateDeviceTool, { device: 'iPhone 15' });
    await record('emulate_device', emulateDeviceTool, { device: 'reset' });

    const payload = buildCurrentSessionSteps();
    expect(payload).not.toBeNull();
    const parsed = JSON.parse(payload!.stepsJson);
    expect(parsed.steps.map((s: { tool: string }) => s.tool)).toEqual([
      'switch_tab',
      'emulate_device',
      'emulate_device',
    ]);
    expect(payload!.generatedJs).toContain('await browser.switchToWindow((await browser.getWindowHandles())[1]);');
    expect(payload!.generatedJs).toContain("restoreDeviceEmulation = await browser.emulate('device', 'iPhone 15');");
    expect(payload!.generatedJs).toContain('await restoreDeviceEmulation?.();');
    expect(payload!.generatedJs).not.toContain('[unknown tool]');
  });
});
