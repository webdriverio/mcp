import { createRequire } from 'node:module';
import type { TraceSession } from './types.js';

const require = createRequire(import.meta.url);
const { version: LIBRARY_VERSION } = require('../../package.json') as { version: string };

const traceSessions = new Map<string, TraceSession>();

export function createTraceSession(
  sessionId: string,
  browserName: string,
  viewport: { width: number; height: number },
  title: string,
  sessionType: 'browser' | 'ios' | 'android' = 'browser',
): TraceSession {
  const prefix = sessionId.slice(0, 8);
  const session: TraceSession = {
    sessionId,
    startWallTime: Date.now(),
    startHrTime: process.hrtime.bigint(),
    pageId: `page@${prefix}`,
    contextId: `context@${prefix}`,
    callCounter: 0,
    events: [],
    screenshots: [],
    browserName,
    viewport,
    sessionType,
    lastAfterEndTime: 0,
    screenshotChain: Promise.resolve(),
  };

  session.events.push({
    version: 8,
    type: 'context-options',
    origin: 'library',
    libraryName: '@wdio/mcp',
    libraryVersion: LIBRARY_VERSION,
    browserName,
    platform: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux',
    wallTime: session.startWallTime,
    monotonicTime: 0,
    sdkLanguage: 'javascript',
    title,
    contextId: session.contextId,
    options: { viewport },
  });

  traceSessions.set(sessionId, session);
  return session;
}

export function getTraceSession(sessionId: string): TraceSession | undefined {
  return traceSessions.get(sessionId);
}

export function deleteTraceSession(sessionId: string): void {
  traceSessions.delete(sessionId);
}

export function getMonotonicMs(session: TraceSession): number {
  return Number((process.hrtime.bigint() - session.startHrTime) / 1_000_000n);
}
