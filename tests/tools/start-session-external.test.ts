import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remote } from 'webdriverio';
import { startSessionTool, startSessionToolDefinition } from '../../src/tools/session.tool';
import { registerSession } from '../../src/session/lifecycle';

vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    sessionId: 'external-session-id',
    capabilities: {},
    setWindowSize: vi.fn(),
  }),
}));

vi.mock('../../src/session/lifecycle', () => ({
  registerSession: vi.fn(),
}));

vi.mock('../../src/session/state', () => ({
  getState: vi.fn(() => ({
    browsers: new Map(),
    currentSession: null,
    sessionMetadata: new Map(),
    sessionHistory: new Map(),
  })),
}));

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callTool = startSessionTool as unknown as ToolFn;
const mockRemote = remote as ReturnType<typeof vi.fn>;
const mockRegisterSession = registerSession as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRemote.mockResolvedValue({
    sessionId: 'external-session-id',
    capabilities: {},
    setWindowSize: vi.fn(),
  });
});

describe('start_session with provider: external', () => {
  it('exposes external provider and endpoint config in the tool schema', () => {
    const providerSchema = startSessionToolDefinition.inputSchema.provider as unknown as {
      safeParse: (value: unknown) => { success: boolean };
    };
    const webdriverConfigSchema = startSessionToolDefinition.inputSchema.webdriverConfig as unknown as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(providerSchema.safeParse('external').success).toBe(true);
    expect(webdriverConfigSchema.safeParse({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: 4445,
      path: '/',
    }).success).toBe(true);
  });

  it('connects to an existing WebDriver endpoint for browser sessions', async () => {
    const result = await callTool({
      provider: 'external',
      platform: 'browser',
      webdriverConfig: {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: 4445,
        path: '/',
      },
      capabilities: {
        browserName: 'tauri',
      },
    });

    expect(result.isError).toBeUndefined();
    expect(mockRemote).toHaveBeenCalledWith(expect.objectContaining({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: 4445,
      path: '/',
      capabilities: expect.objectContaining({
        browserName: 'tauri',
      }),
    }));
    expect(result.content[0].text).toContain(
      'Connected to externally managed WebDriver endpoint with sessionId: external-session-id',
    );
    expect(result.content[0].text).toContain('Endpoint: http://127.0.0.1:4445/');
  });

  it('registers external sessions as attached so close_session detaches by default', async () => {
    await callTool({
      provider: 'external',
      platform: 'browser',
    });

    expect(mockRegisterSession).toHaveBeenCalledWith(
      'external-session-id',
      expect.any(Object),
      expect.objectContaining({
        provider: 'external',
        isAttached: true,
      }),
      expect.any(Object),
    );
  });

  it('rejects mobile platform sessions instead of silently using browser semantics', async () => {
    const result = await callTool({
      provider: 'external',
      platform: 'android',
      deviceName: 'Pixel 7',
      noReset: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('provider "external" currently supports browser platform sessions only');
    expect(mockRemote).not.toHaveBeenCalled();
  });
});
