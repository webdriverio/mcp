import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { listAppsTool, uploadAppTool } from '../../src/tools/browserstack.tool';

vi.mock('node:fs', () => {
  const mocked = {
    existsSync: vi.fn(),
    createReadStream: vi.fn(() => 'mock-stream'),
  };
  return { ...mocked, default: mocked };
});

import * as fs from 'node:fs';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
const callList = listAppsTool as unknown as ToolFn;
const callUpload = uploadAppTool as unknown as ToolFn;

const mockApp = {
  app_name: 'MyApp.apk',
  app_version: '1.2.3',
  app_url: 'bs://abc123',
  app_id: 'app-id-1',
  custom_id: 'MyApp_GB',
  uploaded_at: '2026-03-01T10:00:00.000Z',
};

beforeEach(() => {
  vi.stubEnv('BROWSERSTACK_USERNAME', 'testuser');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');
  vi.spyOn(global, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('list_apps tool', () => {
  it('calls recent_apps endpoint by default', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockApp],
    } as Response);

    await callList({});

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/recent_apps');
    expect((options?.headers as Record<string, string>)?.Authorization).toMatch(/^Basic /);
  });

  it('calls recent_group_apps with default limit=20 when organizationWide is true', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockApp],
    } as Response);

    await callList({ organizationWide: true });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/recent_group_apps?limit=20');
  });

  it('appends custom limit query param when provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockApp],
    } as Response);

    await callList({ organizationWide: true, limit: 5 });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/recent_group_apps?limit=5');
  });

  it('returns formatted app list', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockApp],
    } as Response);

    const result = await callList({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('MyApp.apk');
    expect(result.content[0].text).toContain('bs://abc123');
    expect(result.content[0].text).toContain('[MyApp_GB]');
  });

  it('handles non-array API response gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response);

    const result = await callList({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('No apps found.');
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callList({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BROWSERSTACK_USERNAME');
  });

  it('returns isError true when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const result = await callList({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('network error');
  });
});

describe('upload_app tool', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.createReadStream).mockReturnValue('mock-stream' as unknown as fs.ReadStream);
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callUpload({ path: '/some/app.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BROWSERSTACK_USERNAME');
  });

  it('returns isError true when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await callUpload({ path: '/missing/app.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('/missing/app.apk');
  });

  it('calls upload endpoint and returns bs:// url', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ app_url: 'bs://newapp456', custom_id: null }),
    } as Response);

    const result = await callUpload({ path: '/local/myapp.apk' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('bs://newapp456');
  });

  it('includes custom_id in upload when provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ app_url: 'bs://newapp456', custom_id: 'MyCustomId' }),
    } as Response);

    await callUpload({ path: '/local/myapp.apk', customId: 'MyCustomId' });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/upload');
  });

  it('returns isError true when API returns error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    const result = await callUpload({ path: '/local/myapp.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
  });
});
