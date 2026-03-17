import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRestoreFn = vi.hoisted(() => vi.fn());
const mockEmulate = vi.hoisted(() => vi.fn().mockResolvedValue(mockRestoreFn));

const mockBrowser = vi.hoisted(() => ({
  isBidi: true,
  isAndroid: false,
  isIOS: false,
  emulate: mockEmulate,
}));

vi.mock('../../src/tools/browser.tool', () => {
  const state = {
    browsers: new Map(),
    currentSession: 'test-session' as string | null,
    sessionMetadata: new Map([
      ['test-session', { type: 'browser', capabilities: {}, isAttached: false }],
    ]),
  };
  const getBrowser = vi.fn(() => mockBrowser);
  (getBrowser as any).__state = state;
  return { getBrowser };
});

import { getBrowser } from '../../src/tools/browser.tool';
import { emulateDeviceTool } from '../../src/tools/emulate-device.tool';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const callTool = emulateDeviceTool as unknown as ToolFn;

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowser.isBidi = true;
  mockBrowser.isAndroid = false;
  mockBrowser.isIOS = false;
  mockEmulate.mockResolvedValue(mockRestoreFn);
  const state = (getBrowser as any).__state;
  state.currentSession = 'test-session';
  state.sessionMetadata.set('test-session', { type: 'browser', capabilities: {}, isAttached: false });
});

describe('emulate_device — listing', () => {
  it('returns device list when no device arg provided', async () => {
    mockEmulate.mockRejectedValueOnce(
      new Error('Unknown device name "\u0000", please use one of the following: iPhone 15, Pixel 7, iPad Mini')
    );
    const result = await callTool({});
    expect(result.content[0].text).toContain('iPhone 15');
    expect(result.content[0].text).toContain('Pixel 7');
  });
});

describe('emulate_device — emulation', () => {
  it('calls browser.emulate with the device name', async () => {
    const result = await callTool({ device: 'iPhone 15' });
    expect(mockEmulate).toHaveBeenCalledWith('device', 'iPhone 15');
    expect(result.content[0].text).toContain('iPhone 15');
  });

  it('stores restore function for later reset', async () => {
    await callTool({ device: 'iPhone 15' });
    // Reset should invoke stored fn without calling emulate again
    await callTool({ device: 'reset' });
    expect(mockRestoreFn).toHaveBeenCalledOnce();
    expect(mockEmulate).toHaveBeenCalledOnce(); // only the initial emulate call
  });

  it('returns "no active emulation" message when reset with nothing active', async () => {
    const result = await callTool({ device: 'reset' });
    expect(result.content[0].text).toContain('No active device emulation');
  });
});

describe('emulate_device — guards', () => {
  it('returns error when session is not BiDi', async () => {
    mockBrowser.isBidi = false;
    const result = await callTool({ device: 'iPhone 15' });
    expect(result.content[0].text).toContain('BiDi');
    expect(mockEmulate).not.toHaveBeenCalled();
  });

  it('returns error for iOS session', async () => {
    const state = (getBrowser as any).__state;
    state.sessionMetadata.set('test-session', { type: 'ios', capabilities: {}, isAttached: false });
    const result = await callTool({ device: 'iPhone 15' });
    expect(result.content[0].text).toContain('Error');
    expect(mockEmulate).not.toHaveBeenCalled();
  });

  it('returns error when emulate throws unknown device', async () => {
    mockEmulate.mockRejectedValue(
      new Error('Unknown device name "BadDevice", please use one of the following: iPhone 15')
    );
    const result = await callTool({ device: 'BadDevice' });
    expect(result.content[0].text).toContain('BadDevice');
    expect(result.content[0].text).toContain('emulate_device()');
  });
});
