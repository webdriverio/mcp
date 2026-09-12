import type { Capabilities, Options } from '@wdio/types';
import DevToolsHookService, { TraceType } from '@wdio/devtools-service';

// The published d.ts imports its option types from private workspace paths, so
// ServiceOptions resolves to a bare shape that rejects `mode`.
const TRACE_MODE_OPTIONS = { mode: 'trace', traceFormat: 'zip' } as unknown as ConstructorParameters<
  typeof DevToolsHookService
>[0];

export function attachDevtoolsTrace(
  opts: Record<string, unknown>,
  capabilities: Record<string, unknown>,
): DevToolsHookService {
  // Without mode 'trace' upstream finalizes to an empty array and writes nothing.
  const service = new DevToolsHookService(TRACE_MODE_OPTIONS);
  service.captureType = TraceType.Standalone;
  // Upstream rejects a capabilities object with no top-level browserName/platformName
  // as multiremote, so the real capabilities go in — not the options bag.
  service.beforeSession(
    opts as unknown as Options.Testrunner,
    capabilities as unknown as Capabilities.W3CCapabilities,
  );
  const o = opts as { beforeCommand?: unknown; afterCommand?: unknown };
  o.beforeCommand = Array.isArray(o.beforeCommand) ? o.beforeCommand : o.beforeCommand ? [o.beforeCommand] : [];
  (o.beforeCommand as unknown[]).push(service.beforeCommand.bind(service));
  o.afterCommand = Array.isArray(o.afterCommand) ? o.afterCommand : o.afterCommand ? [o.afterCommand] : [];
  (o.afterCommand as unknown[]).push(service.afterCommand.bind(service));
  return service;
}

export async function beginDevtoolsTrace(handle: DevToolsHookService, browser: WebdriverIO.Browser): Promise<void> {
  await handle.before(browser.capabilities as Capabilities.W3CCapabilities, [], browser);
}

export async function finishDevtoolsTrace(handle: unknown): Promise<void> {
  if (!handle) {
    return;
  }
  await (handle as { after: () => Promise<void> }).after();
}
