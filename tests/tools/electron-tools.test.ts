import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';
import { executeElectronScriptTool } from '../../src/tools/electron-execute.tool';
import { triggerElectronDeeplinkTool } from '../../src/tools/electron-deeplink.tool';

const callElectronScript = executeElectronScriptTool as unknown as (args: { script: string; args?: unknown[] }, extra: unknown) => ReturnType<typeof executeElectronScriptTool>;
const callElectronDeeplink = triggerElectronDeeplinkTool as unknown as (args: { url: string }, extra: unknown) => ReturnType<typeof triggerElectronDeeplinkTool>;

describe('Electron tools', () => {
  beforeEach(() => {
    const state = getState();
    state.browsers.clear(); state.sessionMetadata.clear(); state.sessionHistory.clear(); state.currentSession = null;
  });

  it('rejects main-process execution outside Electron', async () => {
    const result = await callElectronScript({ script: 'return 1' }, {});
    expect(result.isError).toBe(true);
  });

  it('delegates main-process execution with source and args', async () => {
    const execute = vi.fn().mockResolvedValue('My App');
    const state = getState();
    state.currentSession = 'electron';
    state.browsers.set('electron', { electron: { execute } } as any);
    state.sessionMetadata.set('electron', { type: 'browser', runtime: 'electron', capabilities: {}, isAttached: false });
    const result = await callElectronScript({ script: 'return electron.app.getName()', args: ['value'] }, {});
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0].slice(1)).toEqual(['return electron.app.getName()', ['value']]);
    expect(result.isError).toBeUndefined();
  });

  it('delegates deeplinks only for Electron', async () => {
    const triggerDeeplink = vi.fn().mockResolvedValue(undefined);
    const state = getState();
    state.currentSession = 'electron';
    state.browsers.set('electron', { electron: { triggerDeeplink } } as any);
    state.sessionMetadata.set('electron', { type: 'browser', runtime: 'electron', capabilities: {}, isAttached: false });
    const result = await callElectronDeeplink({ url: 'myapp://open/item' }, {});
    expect(triggerDeeplink).toHaveBeenCalledWith('myapp://open/item');
    expect(result.isError).toBeUndefined();
  });
});
