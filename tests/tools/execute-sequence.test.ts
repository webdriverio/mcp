import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';
import type { SessionHistory } from '../../src/types/recording';
import { executeSequenceTool } from '../../src/tools/execute-sequence.tool';

const callTool = executeSequenceTool as unknown as (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean
}>;

// Mock action functions
vi.mock('../../src/tools/click.tool', () => ({
  clickAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'clicked' }] }),
  clickTool: vi.fn(),
  clickToolDefinition: { name: 'click_element', description: '', inputSchema: {} },
}));

vi.mock('../../src/tools/navigate.tool', () => ({
  navigateAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'navigated' }] }),
  navigateTool: vi.fn(),
  navigateToolDefinition: { name: 'navigate', description: '', inputSchema: {} },
}));

vi.mock('../../src/tools/set-value.tool', () => ({
  setValueAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'set' }] }),
  setValueTool: vi.fn(),
  setValueToolDefinition: { name: 'set_value', description: '', inputSchema: {} },
}));

vi.mock('../../src/tools/scroll.tool', () => ({
  scrollAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'scrolled' }] }),
  scrollTool: vi.fn(),
  scrollToolDefinition: { name: 'scroll', description: '', inputSchema: {} },
}));

vi.mock('../../src/tools/gestures.tool', () => ({
  tapAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'tapped' }] }),
  swipeAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'swiped' }] }),
  dragAndDropAction: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'dragged' }] }),
  tapElementTool: vi.fn(),
  swipeTool: vi.fn(),
  dragAndDropTool: vi.fn(),
  tapElementToolDefinition: { name: 'tap_element', description: '', inputSchema: {} },
  swipeToolDefinition: { name: 'swipe', description: '', inputSchema: {} },
  dragAndDropToolDefinition: { name: 'drag_and_drop', description: '', inputSchema: {} },
}));

// Mock stability detector (no-op)
vi.mock('../../src/utils/stability-detector', () => ({
  waitForStability: vi.fn().mockResolvedValue(undefined),
}));

// Mock state-diff
vi.mock('../../src/utils/state-diff', () => ({
  captureStateDelta: vi.fn().mockResolvedValue({ appeared: [], disappeared: [], changed: [] }),
}));

// Mock get-interactable-browser-elements
vi.mock('../../src/scripts/get-interactable-browser-elements', () => ({
  getInteractableBrowserElements: vi.fn().mockResolvedValue([]),
}));

function setupBrowserSession(sessionId = 'sess-1') {
  const state = getState();
  const mockBrowser = {
    isAndroid: false,
    isIOS: false,
    execute: vi.fn().mockResolvedValue({ url: 'http://example.com', title: 'Test' }),
  };
  state.browsers.set(sessionId, mockBrowser as any);
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached: false });
  state.sessionHistory.set(sessionId, {
    sessionId, type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [],
  } as SessionHistory);
  return mockBrowser;
}

beforeEach(() => {
  vi.clearAllMocks();
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('execute_sequence', () => {
  it('dispatches click action', async () => {
    setupBrowserSession();
    const { clickAction } = await import('../../src/tools/click.tool');
    const result = await callTool({ actions: [{ action: 'click', selector: '#btn' }], waitForStability: false });
    expect(clickAction).toHaveBeenCalledWith('#btn', 3000, undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.completed).toBe(1);
  });

  it('dispatches navigate action', async () => {
    setupBrowserSession();
    const { navigateAction } = await import('../../src/tools/navigate.tool');
    await callTool({ actions: [{ action: 'navigate', url: 'https://example.com' }], waitForStability: false });
    expect(navigateAction).toHaveBeenCalledWith('https://example.com');
  });

  it('stops on first failure', async () => {
    setupBrowserSession();
    const { clickAction } = await import('../../src/tools/click.tool');
    const { navigateAction } = await import('../../src/tools/navigate.tool');
    (clickAction as any).mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'Element not found' }] });
    const result = await callTool({
      actions: [
        { action: 'click', selector: '#missing' },
        { action: 'navigate', url: 'https://example.com' },
      ],
      waitForStability: false,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.completed).toBe(0);
    expect(parsed.failed.index).toBe(0);
    expect(parsed.failed.error).toContain('Element not found');
    expect(navigateAction).not.toHaveBeenCalled();
  });

  it('records steps via appendStep', async () => {
    setupBrowserSession();
    await callTool({
      actions: [{ action: 'navigate', url: 'https://a.com' }, { action: 'click', selector: '#b' }],
      waitForStability: false
    });
    const state = getState();
    const steps = state.sessionHistory.get('sess-1')?.steps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].tool).toBe('navigate');
    expect(steps[1].tool).toBe('click');
  });

  it('includes state delta in response', async () => {
    setupBrowserSession();
    const { captureStateDelta } = await import('../../src/utils/state-diff');
    (captureStateDelta as any).mockResolvedValueOnce({ appeared: ['#new-btn'], disappeared: [], changed: [] });
    const result = await callTool({
      actions: [{ action: 'navigate', url: 'https://example.com' }],
      waitForStability: false
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.delta).toBeDefined();
    expect(parsed.delta.appeared).toContain('#new-btn');
  });
});

describe('execute_sequence — stability', () => {
  it('calls waitForStability between actions when enabled', async () => {
    setupBrowserSession();
    const { waitForStability } = await import('../../src/utils/stability-detector');
    await callTool({
      actions: [{ action: 'navigate', url: 'https://a.com' }, { action: 'click', selector: '#b' }],
      waitForStability: true
    });
    expect(waitForStability).toHaveBeenCalled();
  });

  it('skips waitForStability when disabled', async () => {
    setupBrowserSession();
    const { waitForStability } = await import('../../src/utils/stability-detector');
    await callTool({
      actions: [{ action: 'navigate', url: 'https://a.com' }, { action: 'click', selector: '#b' }],
      waitForStability: false
    });
    expect(waitForStability).not.toHaveBeenCalled();
  });
});
