/**
 * Trace recording utilities — Playwright-compatible trace zip for browser sessions.
 *
 * Lightweight subpath export — does NOT include MCP server dependencies.
 * Usage: import { buildTraceZip } from '@wdio/mcp/trace'
 */

import { warnDeprecated } from './utils/deprecation.js';
import { buildTraceZip as buildTraceZipImpl } from './trace/zip-writer.js';
import { createTraceSession as createTraceSessionImpl, getTraceSession as getTraceSessionImpl, getMonotonicMs as getMonotonicMsImpl } from './trace/state.js';
import { mapToolToTraceAction as mapToolToTraceActionImpl, formatActionTitle as formatActionTitleImpl } from './trace/tool-mapping.js';
import type { TraceEvent as TraceEventImpl, TraceSession as TraceSessionImpl, TraceScreenshot as TraceScreenshotImpl } from './trace/types.js';

warnDeprecated('trace');

/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const buildTraceZip = buildTraceZipImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const createTraceSession = createTraceSessionImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const getTraceSession = getTraceSessionImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const getMonotonicMs = getMonotonicMsImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const mapToolToTraceAction = mapToolToTraceActionImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export const formatActionTitle = formatActionTitleImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export type TraceEvent = TraceEventImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export type TraceSession = TraceSessionImpl;
/** @deprecated Removed in @wdio/mcp v5. Traces move to @wdio/devtools-service. */
export type TraceScreenshot = TraceScreenshotImpl;
