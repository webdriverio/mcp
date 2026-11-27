import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { getState, getToolSettings } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';

const run = vi.fn();
vi.mock('@wdio/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSession: vi.fn(async () => ({ run, session: { isWeb: true }, actions: ['click', 'fill', 'select', 'check', 'uncheck', 'press'].map((name) => ({ name })) })),
}));

const { withRecording } = await import('../../src/recording/step-recorder');
const { generateCode } = await import('../../src/recording/code-generator');
const { createServer } = await import('../../src/create-server');
const { clickTool } = await import('../../src/tools/click.tool');
const { performActionsTool, selectOptionTool, pressKeyTool } = await import('../../src/tools/page-input.tool');
const { setCookieTool, deleteCookiesTool } = await import('../../src/tools/cookies.tool');

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

  describe('server registrations', () => {
    afterEach(() => {
      const settings = getToolSettings();
      settings.enabledGroups.clear();
      settings.platform = undefined;
    });

    it('records switch_tab (by handle and index) and emulate_device through real server registrations', async () => {
      const getWindowHandles = vi.fn().mockResolvedValue(['CDwindow-0', 'CDwindow-1']);
      const restoreFn = vi.fn().mockResolvedValue(undefined);
      getState().browsers.set('s1', {
        isBidi: true,
        getWindowHandles,
        switchToWindow: vi.fn().mockResolvedValue(undefined),
        emulate: vi.fn().mockResolvedValue(restoreFn),
      } as unknown as WebdriverIO.Browser);

      const server = createServer('none');
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      try {
        await client.callTool({ name: 'enable_tools', arguments: { groups: ['device'] } });
        await client.callTool({ name: 'switch_tab', arguments: { handle: 'CDwindow-1' } });
        await client.callTool({ name: 'switch_tab', arguments: { index: 0 } });
        await client.callTool({ name: 'emulate_device', arguments: { device: 'iPhone 15' } });
        await client.callTool({ name: 'emulate_device', arguments: { device: 'reset' } });

        expect(getWindowHandles).toHaveBeenCalledTimes(1);

        const stepsRes = await client.readResource({ uri: 'wdio://session/current/steps' });
        const stepsText = (stepsRes.contents[0] as { text: string }).text;
        const parsed = JSON.parse(stepsText);
        expect(parsed.steps.map((s: { tool: string }) => s.tool)).toEqual([
          'switch_tab',
          'switch_tab',
          'emulate_device',
          'emulate_device',
        ]);

        const codeRes = await client.readResource({ uri: 'wdio://session/current/code' });
        const generatedJs = (codeRes.contents[0] as { text: string }).text;
        expect(generatedJs).toContain("// [not replayable: session-specific window handle] switch_tab: 'CDwindow-1'");
        expect(generatedJs).toContain('await browser.switchToWindow((await browser.getWindowHandles())[0]);');
        expect(generatedJs).toContain("restoreDeviceEmulation = await browser.emulate('device', 'iPhone 15');");
        expect(generatedJs).toContain('await restoreDeviceEmulation?.();');
        expect(generatedJs).not.toContain('[unknown tool]');
      } finally {
        await Promise.all([client.close(), server.close()]);
      }
    });

    it('keeps handle-based replay for attach_session and avoids falling back to ignored index on fresh sessions', async () => {
      const getWindowHandles = vi.fn().mockResolvedValue(['CDwindow-0', 'CDwindow-1']);
      getState().browsers.set('s1', {
        isBidi: true,
        getWindowHandles,
        switchToWindow: vi.fn().mockResolvedValue(undefined),
      } as unknown as WebdriverIO.Browser);

      const server = createServer('none');
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      try {
        await client.callTool({ name: 'switch_tab', arguments: { handle: 'CDwindow-0', index: 1 } });
        const freshCodeRes = await client.readResource({ uri: 'wdio://session/current/code' });
        const freshJs = (freshCodeRes.contents[0] as { text: string }).text;
        expect(freshJs).toContain("// [not replayable: session-specific window handle] switch_tab: 'CDwindow-0'");
        expect(freshJs).not.toContain('getWindowHandles())[1]');

        history.steps = [{
          index: 1,
          tool: 'attach_session',
          params: { sessionId: 's1', provider: 'external', platform: 'browser' },
          status: 'ok',
          durationMs: 0,
          timestamp: '2026-01-01T00:00:00.000Z',
        }];
        getState().sessionMetadata.set('s1', { type: 'browser', capabilities: {}, isAttached: true });

        await client.callTool({ name: 'switch_tab', arguments: { handle: 'CDwindow-1', index: 0 } });
        expect(getWindowHandles).not.toHaveBeenCalled();
        expect(history.steps[1].code).toBeUndefined();
        const attachedCodeRes = await client.readResource({ uri: 'wdio://session/current/code' });
        const attachedJs = (attachedCodeRes.contents[0] as { text: string }).text;
        expect(attachedJs).toContain("await browser.switchToWindow('CDwindow-1');");
        expect(attachedJs).not.toContain('getWindowHandles())[1]');
        expect(attachedJs).not.toContain('getWindowHandles())[0]');
      } finally {
        await Promise.all([client.close(), server.close()]);
      }
    });
  });
});
