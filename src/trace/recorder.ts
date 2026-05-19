import sharp from 'sharp';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBrowser, getState } from '../session/state.js';
import { createTraceSession, getMonotonicMs, getTraceSession } from './state.js';
import { formatActionTitle, mapToolToTraceAction } from './tool-mapping.js';
import type { TraceSession } from './types.js';

export function startTrace(sessionId: string, capabilities: Record<string, unknown>, sessionType: 'browser' | 'ios' | 'android' = 'browser', browserViewport?: { width: number; height: number }): void {
  let browserName: string;
  let viewport: { width: number; height: number };
  let title: string;

  if (sessionType === 'browser') {
    browserName = String(capabilities.browserName ?? 'chromium');
    viewport = browserViewport ?? { width: 1920, height: 1080 };
    title = String(capabilities.browserName ?? browserName);
  } else {
    // Vibium player is Playwright-derived and expects a known browserName; use 'chromium' as safe fallback
    browserName = 'chromium';
    const deviceName = String(capabilities['appium:deviceName'] ?? capabilities.deviceName ?? 'device');
    const platformVersion = capabilities['appium:platformVersion'] ?? capabilities.platformVersion ?? '';
    title = `${sessionType} - ${deviceName}${platformVersion ? ` (${platformVersion})` : ''}`;
    viewport = sessionType === 'ios' ? { width: 390, height: 844 } : { width: 412, height: 915 };
  }

  createTraceSession(sessionId, browserName, viewport, title, sessionType);
}

export function endTrace(_sessionId: string): void {
  // TraceSession stays in state until exported
}

// Records the initial page load that happens inside start_session (navigationUrl).
// The navigation is done directly via wdioBrowser.url(), bypassing withTrace, so we
// record it here as a synthetic trace event after the fact.
export async function recordInitialNavigation(sessionId: string, url: string): Promise<void> {
  const traceSession = getTraceSession(sessionId);
  if (!traceSession) return;

  const callId = `call@${++traceSession.callCounter}`;
  const startTime = getMonotonicMs(traceSession);

  traceSession.events.push({
    type: 'before',
    callId,
    startTime,
    class: 'Page',
    method: 'navigate',
    pageId: traceSession.pageId,
    params: { url },
    title: `Page.navigate("${url.slice(0, 80)}")`,
  });

  await captureScreenshot(traceSession);

  const navEndTime = getMonotonicMs(traceSession);
  traceSession.events.push({
    type: 'after',
    callId,
    endTime: navEndTime,
  });
  traceSession.lastAfterEndTime = navEndTime;
}

export function withTrace(toolName: string, callback: ToolCallback): ToolCallback {
  return async (params, extra) => {
    const state = getState();
    const sessionId = state.currentSession;

    if (!sessionId) return callback(params, extra);

    const metadata = state.sessionMetadata.get(sessionId);
    if (!metadata?.trace) return callback(params, extra);

    const traceSession = getTraceSession(sessionId);
    if (!traceSession) return callback(params, extra);

    const action = mapToolToTraceAction(toolName);
    if (!action) return callback(params, extra);

    // Capture pre-action screenshot synchronously (what the agent sees before acting).
    // The 200–1300ms screenshot duration also acts as a natural settle window,
    // letting the previous action's animations clear before the next tap fires.
    await captureScreenshot(traceSession);

    // Appium round-trips are slow; add a static settle delay so animations
    // from the previous action finish before the next one fires.
    if (traceSession.sessionType !== 'browser') {
      await new Promise<void>((r) => setTimeout(r, 50));
    }

    const callId = `call@${++traceSession.callCounter}`;
    const startTime = getMonotonicMs(traceSession);

    traceSession.events.push({
      type: 'before',
      callId,
      startTime,
      class: action.class,
      method: action.method,
      pageId: traceSession.pageId,
      params: params as Record<string, unknown>,
      title: formatActionTitle(action, params as Record<string, unknown>),
    });

    let result: Awaited<ReturnType<ToolCallback>>;
    let actionError: string | undefined;

    try {
      result = await callback(params, extra);
      if ((result as { isError?: boolean }).isError) {
        const text = result.content?.find((c) => c.type === 'text')?.text;
        actionError = text ? String(text) : 'unknown error';
      }
    } catch (e) {
      actionError = String(e);
      const errorEndTime = getMonotonicMs(traceSession);
      traceSession.events.push({
        type: 'after',
        callId,
        endTime: errorEndTime,
        error: { message: actionError },
      });
      traceSession.lastAfterEndTime = errorEndTime;
      throw e;
    }

    const endTime = getMonotonicMs(traceSession);
    traceSession.events.push({
      type: 'after',
      callId,
      endTime,
      ...(actionError ? { error: { message: actionError } } : {}),
    });
    traceSession.lastAfterEndTime = endTime;

    return result;
  };
}

// Captures a final screenshot at session end (shows the last screen state).
export function captureTraceScreenshot(sessionId: string, browser?: WebdriverIO.Browser): void {
  const traceSession = getTraceSession(sessionId);
  if (!traceSession) return;
  const p = captureScreenshot(traceSession, browser);
  traceSession.screenshotChain = traceSession.screenshotChain.then(() => p);
}

async function captureScreenshot(traceSession: TraceSession, browser?: WebdriverIO.Browser): Promise<void> {
  try {
    const b = browser ?? getBrowser();
    const base64 = await b.takeScreenshot();
    const inputBuffer = Buffer.from(base64, 'base64');
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const width = metadata.width ?? 1280;
    const height = metadata.height ?? 720;
    const jpegBuffer = await image.jpeg({ quality: 60 }).toBuffer();
    const wallTimestamp = traceSession.startWallTime + getMonotonicMs(traceSession);
    const resourceName = `${traceSession.pageId}-${wallTimestamp}.jpeg`;

    traceSession.screenshots.push({ resourceName, data: jpegBuffer, width, height });
    traceSession.events.push({
      type: 'screencast-frame',
      pageId: traceSession.pageId,
      sha1: resourceName,
      width,
      height,
      // Stamp at the previous action's endTime so the player shows this frame
      // as the result of that action, not as the "before" state of the next one.
      timestamp: traceSession.lastAfterEndTime,
    });
  } catch {
    // Screenshot failures must not mask the action result
  }
}
