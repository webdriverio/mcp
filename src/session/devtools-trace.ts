import type { Capabilities, Options } from '@wdio/types';
import DevToolsHookService, { TraceType } from '@wdio/devtools-service';

export type DevtoolsTraceHandle = DevToolsHookService;

// Without mode 'trace' upstream finalizes to an empty array and writes nothing.
// The cast is needed because the published d.ts imports its option types from
// private workspace paths, so ServiceOptions resolves to a bare shape.
const TRACE_MODE_OPTIONS = { mode: 'trace', traceFormat: 'zip' } as unknown as ConstructorParameters<
  typeof DevToolsHookService
>[0];

function appendHook(opts: Record<string, unknown>, key: 'beforeCommand' | 'afterCommand', hook: unknown): void {
  const existing = opts[key];
  opts[key] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), hook];
}

export function attachDevtoolsTrace(opts: Record<string, unknown>): DevtoolsTraceHandle {
  const service = new DevToolsHookService(TRACE_MODE_OPTIONS);
  service.captureType = TraceType.Standalone;
  // Upstream rejects capabilities with no top-level browserName/platformName as
  // multiremote, so this has to be the session's real capabilities.
  service.beforeSession(opts as unknown as Options.Testrunner, opts.capabilities as Capabilities.W3CCapabilities);
  appendHook(opts, 'beforeCommand', service.beforeCommand.bind(service));
  appendHook(opts, 'afterCommand', service.afterCommand.bind(service));
  return service;
}

export async function beginDevtoolsTrace(handle: DevtoolsTraceHandle, browser: WebdriverIO.Browser): Promise<void> {
  try {
    await handle.before(browser.capabilities as Capabilities.W3CCapabilities, [], browser);
  } catch (e) {
    // The session is already live here, so a capture that cannot start must not
    // take session start down with it. The handle stays so close still exports.
    console.error('[WARN] Trace capture failed to start; the session continues untraced:', e);
  }
}

export async function finishDevtoolsTrace(handle?: DevtoolsTraceHandle): Promise<void> {
  await handle?.after();
}
