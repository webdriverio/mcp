/**
 * Trace recording utilities — Playwright-compatible trace zip for browser sessions.
 *
 * Lightweight subpath export — does NOT include MCP server dependencies.
 * Usage: import { buildTraceZip } from '@wdio/mcp/trace'
 */

export { buildTraceZip } from './trace/zip-writer.js';
export { createTraceSession, getTraceSession, getMonotonicMs } from './trace/state.js';
export { mapToolToTraceAction, formatActionTitle } from './trace/tool-mapping.js';
export type { TraceEvent, TraceSession, TraceScreenshot } from './trace/types.js';
