import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { coerceBoolean } from '../utils/zod-helpers';
import { basicAuth } from '../utils/auth';
import { resolveCloudHost } from '../providers/cloud/digitalai.provider';

// ─── Provider API config ───────────────────────────────────────────────────────

interface ProviderApiConfig {
  /** Display name in error messages */
  name: string;
  /** Base URL for the API */
  apiBase: string;
  /** Env var names for credentials */
  credsEnvNames: [string, string];
  /** Authorization scheme for API requests (default: 'basic'). */
  authScheme?: 'basic' | 'bearer';
  /** list_apps endpoint path (relative to apiBase) */
  listPath: string;
  /** Whether list endpoint supports org-wide query param (BrowserStack only) */
  supportsOrgWide: boolean;
  /** Parse list response into a normalized array of { name, ref, uploadedAt, customId } */
  parseListResponse: (raw: unknown) => NormalizedApp[];
  /** upload_app endpoint path (relative to apiBase) */
  uploadPath: string;
  /** FormData field name for the file */
  uploadField: string;
  /** Parse upload response into { appRef, appName } */
  parseUploadResponse: (raw: unknown, fileName: string) => { appRef: string; appName: string };
}

interface NormalizedApp {
  name: string;
  ref: string;          // bs://... or storage:filename=...
  uploadedAt?: string;  // ISO timestamp string
  customId?: string;
}

function formatAppList(apps: NormalizedApp[]): string {
  if (apps.length === 0) return 'No apps found.';
  return apps.map((a) => {
    const id = a.customId ? ` [${a.customId}]` : '';
    const ts = a.uploadedAt ?? 'unknown';
    return `${a.name}${id} — ${a.ref} (${ts})`;
  }).join('\n');
}

const PROVIDER_CONFIGS: Record<string, ProviderApiConfig> = {
  browserstack: {
    name: 'BrowserStack',
    apiBase: 'https://api-cloud.browserstack.com',
    credsEnvNames: ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY'],
    listPath: '/app-automate/recent_apps',
    supportsOrgWide: true,
    parseListResponse: (raw) => {
      const apps = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
      return apps.map((a) => ({
        name: `${a.app_name}`,
        ref: `${a.app_url}`,
        uploadedAt: `${a.uploaded_at}`,
        customId: a.custom_id as string | undefined,
      }));
    },
    uploadPath: '/app-automate/upload',
    uploadField: 'file',
    parseUploadResponse: (raw, fileName) => {
      const data = raw as { app_url: string; custom_id?: string };
      return { appRef: data.app_url, appName: fileName };
    },
  },
  saucelabs: {
    name: 'Sauce Labs',
    apiBase: 'https://api.eu-central-1.saucelabs.com', // region overridden via param
    credsEnvNames: ['SAUCE_USERNAME', 'SAUCE_ACCESS_KEY'],
    listPath: '/v1/storage/files',
    supportsOrgWide: false,
    parseListResponse: (raw) => {
      const data = raw as { items?: { name: string; id: string; uploadTimestamp?: number; customId?: string }[] };
      return (data.items ?? []).map((a) => ({
        name: a.name,
        ref: `storage:filename=${a.name}`,
        uploadedAt: a.uploadTimestamp ? new Date(a.uploadTimestamp).toISOString() : undefined,
        customId: a.customId,
      }));
    },
    uploadPath: '/v1/storage/upload',
    uploadField: 'payload',
    parseUploadResponse: (raw, fileName) => {
      const data = raw as { item?: { id: string; name: string } };
      const name = data.item?.name ?? fileName;
      return { appRef: `storage:filename=${name}`, appName: name };
    },
  },
  testmu: {
    name: 'TestMu',
    apiBase: 'https://manual-api.lambdatest.com',
    credsEnvNames: ['TESTMU_USERNAME', 'TESTMU_ACCESS_KEY'],
    listPath: '/app/data',
    supportsOrgWide: false,
    parseListResponse: (raw) => {
      // LambdaTest returns { data: [...], metaData: {...} }
      if (raw === null || raw === undefined || typeof raw !== 'object') return [];

      const data = raw as { data?: Record<string, unknown>[] };
      const apps = data.data ?? (Array.isArray(raw) ? raw as Record<string, unknown>[] : []);
      return apps.map((a) => ({
        name: (a.name ?? a.app_name ?? 'unknown') as string,
        ref: a.app_id ? `lt://${a.app_id}` : `lt://${a.custom_id ?? 'unknown'}`,
        uploadedAt: a.updated_at as string | undefined,
        customId: a.custom_id as string | undefined,
      }));
    },
    uploadPath: '/app/upload/realDevice',
    uploadField: 'appFile',
    parseUploadResponse: (raw, fileName) => {
      const data = raw as { app_id?: string; app_url?: string; name?: string };
      const ref = data.app_id ? `lt://${data.app_id}` : (data.app_url ?? 'unknown');
      return { appRef: ref, appName: data.name ?? fileName };
    },
  },
  testingbot: {
    name: 'TestingBot',
    apiBase: 'https://api.testingbot.com',
    credsEnvNames: ['TESTINGBOT_KEY', 'TESTINGBOT_SECRET'],
    listPath: '/v1/storage',
    supportsOrgWide: false,
    parseListResponse: (raw) => {
      // TestingBot returns { data: [{ app_url, filename, type, version, created_at }] }
      const data = raw as { data?: Record<string, unknown>[] };
      const apps = data.data ?? (Array.isArray(raw) ? raw as Record<string, unknown>[] : []);
      return apps.map((a) => ({
        name: (a.filename ?? a.name ?? 'unknown') as string,
        ref: (a.app_url as string | undefined) ?? 'unknown',
        uploadedAt: a.created_at as string | undefined,
      }));
    },
    uploadPath: '/v1/storage',
    uploadField: 'file',
    parseUploadResponse: (raw, fileName) => {
      const data = raw as { app_url?: string };
      return { appRef: data.app_url ?? 'unknown', appName: fileName };
    },
  },
  digitalai: {
    name: 'Digital.ai',
    apiBase: '', // derived from DIGITALAI_CLOUD_URL in getProviderConfig
    credsEnvNames: ['DIGITALAI_ACCESS_KEY', 'DIGITALAI_CLOUD_URL'],
    authScheme: 'bearer',
    listPath: '/api/v1/applications',
    supportsOrgWide: false,
    parseListResponse: (raw) => {
      // Apps are referenced in a session as "cloud:<package-or-bundle>" (the `name` field).
      const apps = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
      return apps.map((a) => ({
        name: (a.applicationName ?? a.name ?? 'unknown') as string,
        ref: a.name ? `cloud:${a.name}` : 'unknown',
        uploadedAt: a.createdAtFormatted as string | undefined,
        customId: a.uniqueName as string | undefined,
      }));
    },
    uploadPath: '/api/v1/applications/new',
    uploadField: 'file',
    parseUploadResponse: (raw, fileName) => {
      const data = (raw as { data?: { name?: string } }).data ?? {};
      const name = data.name ?? fileName;
      return { appRef: `cloud:${name}`, appName: name };
    },
  },
};

function getProviderConfig(provider: string, region?: string): { config: ProviderApiConfig; authHeader: string } | { error: string } {
  const base = PROVIDER_CONFIGS[provider];
  if (!base) return { error: `Unknown provider: ${provider}` };

  // Bearer providers (Digital.ai) use a single access key; the second env var is the cloud URL.
  if (base.authScheme === 'bearer') {
    const [keyEnv, urlEnv] = base.credsEnvNames;
    const key = process.env[keyEnv];
    const host = resolveCloudHost(process.env[urlEnv]);
    if (!key || !host) {
      return { error: `Missing credentials: set ${base.credsEnvNames.join(' and ')} environment variables.` };
    }
    return { config: { ...base, apiBase: `https://${host}` }, authHeader: `Bearer ${key}` };
  }

  const [userEnv, keyEnv] = base.credsEnvNames;
  const user = process.env[userEnv];
  const key = process.env[keyEnv];
  if (!user || !key) {
    const vars = base.credsEnvNames.join(' and ');
    return { error: `Missing credentials: set ${vars} environment variables.` };
  }
  // Apply region to Sauce Labs API base
  const config = provider === 'saucelabs'
    ? { ...base, apiBase: `https://api.${region ?? 'eu-central-1'}.saucelabs.com` }
    : base;
  return { config, authHeader: `Basic ${basicAuth(user, key)}` };
}

// ─── list_apps ────────────────────────────────────────────────────────────────

export const listAppsToolDefinition: ToolDefinition = {
  name: 'list_apps',
  description: 'List apps uploaded to a cloud provider (BrowserStack App Automate, Sauce Labs App Storage, TestMu Real Device Cloud, TestingBot Storage, or Digital.ai Applications). Reads provider-specific credentials from environment.',
  annotations: { title: 'List Cloud Provider Apps', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    provider: z.enum(['browserstack', 'saucelabs', 'testmu', 'testingbot', 'digitalai']).describe('Cloud provider'),
    sortBy: z.enum(['app_name', 'uploaded_at']).optional().default('uploaded_at').describe('Sort order for results'),
    organizationWide: coerceBoolean.optional().default(false).describe('(BrowserStack only) List apps uploaded by all users in the organization. Defaults to false (own uploads only).'),
    limit: z.number().int().min(1).optional().default(20).describe('Maximum number of apps to return (only applies when organizationWide is true, default 20)'),
    region: z.enum(['us-west-1', 'eu-central-1', 'apac-southeast-1']).optional().default('eu-central-1').describe('Sauce Labs region (default: eu-central-1)'),
  },
};

type ListAppsArgs = {
  provider: 'browserstack' | 'saucelabs' | 'testmu' | 'testingbot' | 'digitalai';
  sortBy?: 'app_name' | 'uploaded_at';
  organizationWide?: boolean;
  limit?: number;
  region?: 'us-west-1' | 'eu-central-1' | 'apac-southeast-1';
};

export const listAppsTool: ToolCallback = async (args: ListAppsArgs) => {
  const { provider, sortBy = 'uploaded_at', organizationWide = false, limit = 20, region = 'eu-central-1' } = args;
  const resolved = getProviderConfig(provider, region);
  if ('error' in resolved) {
    return { isError: true as const, content: [{ type: 'text' as const, text: resolved.error }] };
  }
  const { config, authHeader } = resolved;

  try {
    let url = `${config.apiBase}${config.listPath}`;
    if (config.supportsOrgWide && organizationWide) {
      url = `${config.apiBase}/app-automate/recent_group_apps?limit=${limit}`;
    }

    // TestMu requires ?type= param — fetch both platforms and merge
    let apps: NormalizedApp[] = [];
    if (provider === 'testmu') {
      const errors: string[] = [];
      for (const platform of ['android', 'ios']) {
        try {
          const res = await fetch(`${url}?type=${platform}`, {
            headers: { Authorization: authHeader },
          });
          if (res.ok) {
            const raw = await res.json();
            apps.push(...config.parseListResponse(raw));
          } else {
            const body = await res.text();
            errors.push(`${config.name} API error ${res.status} (${platform}): ${body}`);
          }
        } catch (e) {
          errors.push(String(e));
        }
      }
      if (apps.length === 0 && errors.length > 0) {
        const message = errors.length === 1 ? errors[0] : `All platform fetches failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
        return { isError: true as const, content: [{ type: 'text' as const, text: `Error listing apps: ${message}` }] };
      }
    } else {
      const res = await fetch(url, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        const body = await res.text();
        return { isError: true as const, content: [{ type: 'text' as const, text: `${config.name} API error ${res.status}: ${body}` }] };
      }

      const raw = await res.json();
      apps = config.parseListResponse(raw);
    }
    apps = sortBy === 'app_name'
      ? apps.sort((a, b) => a.name.localeCompare(b.name))
      : apps.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
    return { content: [{ type: 'text' as const, text: formatAppList(apps) }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error listing apps: ${e}` }] };
  }
};

// ─── upload_app ───────────────────────────────────────────────────────────────

export const uploadAppToolDefinition: ToolDefinition = {
  name: 'upload_app',
  description: 'Upload a local .apk or .ipa to a cloud provider (BrowserStack, Sauce Labs, TestMu, TestingBot, or Digital.ai). Returns the app URL for use in start_session.',
  annotations: { title: 'Upload App to Cloud Provider', destructiveHint: false },
  inputSchema: {
    provider: z.enum(['browserstack', 'saucelabs', 'testmu', 'testingbot', 'digitalai']).describe('Cloud provider'),
    path: z.string().describe('Absolute path to the .apk or .ipa file'),
    customId: z.string().optional().describe('Optional custom ID for the app (used to reference it later)'),
    region: z.enum(['us-west-1', 'eu-central-1', 'apac-southeast-1']).optional().default('eu-central-1').describe('Sauce Labs region (default: eu-central-1)'),
  },
};

type UploadAppArgs = {
  provider: 'browserstack' | 'saucelabs' | 'testmu' | 'testingbot' | 'digitalai';
  path: string;
  customId?: string;
  region?: 'us-west-1' | 'eu-central-1' | 'apac-southeast-1';
};

export const uploadAppTool: ToolCallback = async (args: UploadAppArgs) => {
  const { provider, path, customId, region = 'eu-central-1' } = args;
  const resolved = getProviderConfig(provider, region);
  if ('error' in resolved) {
    return { isError: true as const, content: [{ type: 'text' as const, text: resolved.error }] };
  }
  const { config, authHeader } = resolved;

  if (!existsSync(path)) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `File not found: ${path}` }] };
  }

  const fileName = path.split('/').pop() ?? 'app';

  try {
    const form = new FormData();
    const fileBuffer = readFileSync(path);
    const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    form.append(config.uploadField, fileBlob, fileName);
    if (customId) form.append('custom_id', customId);

    const res = await fetch(`${config.apiBase}${config.uploadPath}`, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { isError: true as const, content: [{ type: 'text' as const, text: `Upload failed ${res.status}: ${body}` }] };
    }

    const raw = await res.json();
    const { appRef } = config.parseUploadResponse(raw, fileName);
    const customIdNote = customId ? `\nCustom ID: ${customId}` : '';
    return { content: [{ type: 'text' as const, text: `Upload successful.\nApp: ${appRef}${customIdNote}\n\nUse "${appRef}" as the "app" parameter in start_session with provider: "${provider}".` }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error uploading app: ${e}` }] };
  }
};
