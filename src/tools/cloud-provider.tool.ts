import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';

const BS_API = 'https://api-cloud.browserstack.com';
const SL_API = 'https://api.eu-central-1.saucelabs.com';

function getAuth(provider: 'browserstack' | 'saucelabs'): string | null {
  if (provider === 'browserstack') {
    const user = process.env.BROWSERSTACK_USERNAME;
    const key = process.env.BROWSERSTACK_ACCESS_KEY;
    if (!user || !key) return null;
    return Buffer.from(`${user}:${key}`).toString('base64');
  }
  const user = process.env.SAUCE_USERNAME;
  const key = process.env.SAUCE_ACCESS_KEY;
  if (!user || !key) return null;
  return Buffer.from(`${user}:${key}`).toString('base64');
}

// ─── BrowserStack helpers ─────────────────────────────────────────────────────

export interface BrowserStackApp {
  app_name: string;
  app_version: string;
  app_url: string;
  app_id: string;
  custom_id?: string;
  uploaded_at: string;
}

function formatBSAppList(apps: BrowserStackApp[]): string {
  if (apps.length === 0) return 'No apps found.';
  return apps.map((a) => {
    const id = a.custom_id ? ` [${a.custom_id}]` : '';
    return `${a.app_name} v${a.app_version}${id} — ${a.app_url} (${a.uploaded_at})`;
  }).join('\n');
}

// ─── Sauce Labs helpers ───────────────────────────────────────────────────────

interface SauceLabsApp {
  id: string;
  name: string;
  version?: string;
  uploadTimestamp?: number;
  customId?: string;
}

function formatSLAppList(apps: SauceLabsApp[]): string {
  if (apps.length === 0) return 'No apps found.';
  return apps.map((a) => {
    const id = a.customId ? ` [${a.customId}]` : '';
    const timestamp = a.uploadTimestamp ? new Date(a.uploadTimestamp).toISOString() : 'unknown';
    return `${a.name}${id} — storage:filename=${a.name} (${timestamp})`;
  }).join('\n');
}

// ─── list_apps ────────────────────────────────────────────────────────────────

export const listAppsToolDefinition: ToolDefinition = {
  name: 'list_apps',
  description: 'List apps uploaded to a cloud provider (BrowserStack App Automate or Sauce Labs App Storage). Reads provider-specific credentials from environment.',
  annotations: { title: 'List Cloud Provider Apps', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    provider: z.enum(['browserstack', 'saucelabs']).describe('Cloud provider'),
    sortBy: z.enum(['app_name', 'uploaded_at']).optional().default('uploaded_at').describe('Sort order for results'),
    organizationWide: coerceBoolean.optional().default(false).describe('(BrowserStack only) List apps uploaded by all users in the organization. Defaults to false (own uploads only).'),
    limit: z.number().int().min(1).optional().default(20).describe('Maximum number of apps to return (only applies when organizationWide is true, default 20)'),
  },
};

type ListAppsArgs = {
  provider: 'browserstack' | 'saucelabs';
  sortBy?: 'app_name' | 'uploaded_at';
  organizationWide?: boolean;
  limit?: number;
};

export const listAppsTool: ToolCallback = async (args: ListAppsArgs) => {
  const { provider, sortBy = 'uploaded_at', organizationWide = false, limit = 20 } = args;
  const auth = getAuth(provider);
  if (!auth) {
    const vars = provider === 'browserstack' ? 'BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY' : 'SAUCE_USERNAME and SAUCE_ACCESS_KEY';
    return { isError: true as const, content: [{ type: 'text' as const, text: `Missing credentials: set ${vars} environment variables.` }] };
  }

  try {
    if (provider === 'browserstack') {
      let url = `${BS_API}/app-automate/${organizationWide ? 'recent_group_apps' : 'recent_apps'}`;
      if (organizationWide && limit) url += `?limit=${limit}`;

      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });

      if (!res.ok) {
        const body = await res.text();
        return { isError: true as const, content: [{ type: 'text' as const, text: `BrowserStack API error ${res.status}: ${body}` }] };
      }

      const raw = await res.json();
      let apps: BrowserStackApp[] = Array.isArray(raw) ? raw : [];
      apps = sortBy === 'app_name' ? apps.sort((a, b) => a.app_name.localeCompare(b.app_name)) : apps.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
      return { content: [{ type: 'text' as const, text: formatBSAppList(apps) }] };
    }

    // Sauce Labs
    const res = await fetch(`${SL_API}/v1/storage/files`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const body = await res.text();
      return { isError: true as const, content: [{ type: 'text' as const, text: `Sauce Labs API error ${res.status}: ${body}` }] };
    }

    const raw = await res.json() as { items?: SauceLabsApp[] };
    let apps: SauceLabsApp[] = raw.items ?? [];
    apps = sortBy === 'app_name'
      ? apps.sort((a, b) => a.name.localeCompare(b.name))
      : apps.sort((a, b) => (b.uploadTimestamp ?? 0) - (a.uploadTimestamp ?? 0));
    return { content: [{ type: 'text' as const, text: formatSLAppList(apps) }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error listing apps: ${e}` }] };
  }
};

// ─── upload_app ───────────────────────────────────────────────────────────────

export const uploadAppToolDefinition: ToolDefinition = {
  name: 'upload_app',
  description: 'Upload a local .apk or .ipa to a cloud provider (BrowserStack App Automate or Sauce Labs App Storage). Returns the app URL for use in start_session.',
  annotations: { title: 'Upload App to Cloud Provider', destructiveHint: false },
  inputSchema: {
    provider: z.enum(['browserstack', 'saucelabs']).describe('Cloud provider'),
    path: z.string().describe('Absolute path to the .apk or .ipa file'),
    customId: z.string().optional().describe('Optional custom ID for the app (used to reference it later)'),
  },
};

type UploadAppArgs = {
  provider: 'browserstack' | 'saucelabs';
  path: string;
  customId?: string;
};

export const uploadAppTool: ToolCallback = async (args: UploadAppArgs) => {
  const { provider, path, customId } = args;
  const auth = getAuth(provider);
  if (!auth) {
    const vars = provider === 'browserstack' ? 'BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY' : 'SAUCE_USERNAME and SAUCE_ACCESS_KEY';
    return { isError: true as const, content: [{ type: 'text' as const, text: `Missing credentials: set ${vars} environment variables.` }] };
  }

  if (!existsSync(path)) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `File not found: ${path}` }] };
  }

  const fileName = path.split('/').pop() ?? 'app';

  try {
    if (provider === 'browserstack') {
      const form = new FormData();
      const fileBuffer = readFileSync(path);
      const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
      form.append('file', fileBlob, fileName);
      if (customId) form.append('custom_id', customId);

      const res = await fetch(`${BS_API}/app-automate/upload`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}` },
        body: form,
      });

      if (!res.ok) {
        const body = await res.text();
        return { isError: true as const, content: [{ type: 'text' as const, text: `Upload failed ${res.status}: ${body}` }] };
      }

      const data = await res.json() as { app_url: string; custom_id?: string };
      const customIdNote = data.custom_id ? `\nCustom ID: ${data.custom_id}` : '';
      return { content: [{ type: 'text' as const, text: `Upload successful.\nApp URL: ${data.app_url}${customIdNote}\n\nUse this URL as the "app" parameter in start_session with provider: "browserstack".` }] };
    }

    // Sauce Labs
    const form = new FormData();
    const fileBuffer = readFileSync(path);
    const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    form.append('payload', fileBlob, fileName);

    const res = await fetch(`${SL_API}/v1/storage/upload`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { isError: true as const, content: [{ type: 'text' as const, text: `Upload failed ${res.status}: ${body}` }] };
    }

    const data = await res.json() as { item?: { id: string; name: string } };
    const appName = data.item?.name ?? fileName;
    const customIdNote = customId ? `\nCustom ID: ${customId}` : '';
    return { content: [{ type: 'text' as const, text: `Upload successful.\nApp: storage:filename=${appName}${customIdNote}\n\nUse "storage:filename=${appName}" as the "app" parameter in start_session with provider: "saucelabs".` }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error uploading app: ${e}` }] };
  }
};
