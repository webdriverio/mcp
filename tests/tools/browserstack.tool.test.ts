import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { listAppsTool, uploadAppTool } from '../../src/tools/cloud-provider.tool';

vi.mock('node:fs', () => {
  const mocked = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('mock-file-content')),
  };
  return { ...mocked, default: mocked };
});

import * as fs from 'node:fs';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
const callList = listAppsTool as unknown as ToolFn;
const callUpload = uploadAppTool as unknown as ToolFn;

const mockBSApp = {
  app_name: 'MyApp.apk',
  app_version: '1.2.3',
  app_url: 'bs://abc123',
  app_id: 'app-id-1',
  custom_id: 'MyApp_GB',
  uploaded_at: '2026-03-01T10:00:00.000Z',
};

const mockSLApp = {
  id: 'abc123',
  name: 'MyApp.apk',
  version: '1.2.3',
  uploadTimestamp: 1711234567890,
  customId: 'MyApp_GB',
};

// ─── BrowserStack tests ───────────────────────────────────────────────────────

describe('list_apps tool (BrowserStack)', () => {
  beforeEach(() => {
    vi.stubEnv('BROWSERSTACK_USERNAME', 'testuser');
    vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('calls recent_apps endpoint by default', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockBSApp],
    } as Response);

    await callList({ provider: 'browserstack' });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/recent_apps');
    expect((options?.headers as Record<string, string>)?.Authorization).toMatch(/^Basic /);
  });

  it('calls recent_group_apps with default limit=20 when organizationWide is true', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockBSApp],
    } as Response);

    await callList({ provider: 'browserstack', organizationWide: true });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api-cloud.browserstack.com/app-automate/recent_group_apps?limit=20');
  });

  it('returns formatted app list', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [mockBSApp],
    } as Response);

    const result = await callList({ provider: 'browserstack' });
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

    const result = await callList({ provider: 'browserstack' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('No apps found.');
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callList({ provider: 'browserstack' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BROWSERSTACK_USERNAME');
  });

  it('returns isError true when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const result = await callList({ provider: 'browserstack' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('network error');
  });
});

describe('upload_app tool (BrowserStack)', () => {
  beforeEach(() => {
    vi.stubEnv('BROWSERSTACK_USERNAME', 'testuser');
    vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'testkey');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('mock-file-content'));
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callUpload({ provider: 'browserstack', path: '/some/app.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BROWSERSTACK_USERNAME');
  });

  it('returns isError true when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await callUpload({ provider: 'browserstack', path: '/missing/app.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('/missing/app.apk');
  });

  it('calls upload endpoint and returns bs:// url', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ app_url: 'bs://newapp456', custom_id: null }),
    } as Response);

    const result = await callUpload({ provider: 'browserstack', path: '/local/myapp.apk' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('bs://newapp456');
  });

  it('returns isError true when API returns error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    const result = await callUpload({ provider: 'browserstack', path: '/local/myapp.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
  });
});

// ─── Sauce Labs tests ─────────────────────────────────────────────────────────

describe('list_apps tool (Sauce Labs)', () => {
  beforeEach(() => {
    vi.stubEnv('SAUCE_USERNAME', 'testuser');
    vi.stubEnv('SAUCE_ACCESS_KEY', 'testkey');
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('calls Sauce Labs storage/files endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [mockSLApp] }),
    } as Response);

    await callList({ provider: 'saucelabs' });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eu-central-1.saucelabs.com/v1/storage/files');
    expect((options?.headers as Record<string, string>)?.Authorization).toMatch(/^Basic /);
  });

  it('returns formatted app list with storage:filename= format', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [mockSLApp] }),
    } as Response);

    const result = await callList({ provider: 'saucelabs' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('MyApp.apk');
    expect(result.content[0].text).toContain('storage:filename=MyApp.apk');
  });

  it('handles empty items gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    const result = await callList({ provider: 'saucelabs' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('No apps found.');
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callList({ provider: 'saucelabs' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SAUCE_USERNAME');
  });
});

describe('upload_app tool (Sauce Labs)', () => {
  beforeEach(() => {
    vi.stubEnv('SAUCE_USERNAME', 'testuser');
    vi.stubEnv('SAUCE_ACCESS_KEY', 'testkey');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('mock-file-content'));
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('calls Sauce Labs storage/upload endpoint and returns storage:filename= format', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: 'abc123', name: 'myapp.apk' } }),
    } as Response);

    const result = await callUpload({ provider: 'saucelabs', path: '/local/myapp.apk' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('storage:filename=myapp.apk');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eu-central-1.saucelabs.com/v1/storage/upload');
  });

  it('returns isError true when credentials are missing', async () => {
    vi.unstubAllEnvs();
    const result = await callUpload({ provider: 'saucelabs', path: '/some/app.apk' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SAUCE_USERNAME');
  });
});
