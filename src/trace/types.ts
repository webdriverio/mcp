export interface ContextOptionsEvent {
  version: 8;
  type: 'context-options';
  origin: 'library';
  libraryName: string;
  libraryVersion: string;
  browserName: string;
  platform: 'darwin' | 'linux' | 'windows';
  wallTime: number;
  monotonicTime: 0;
  sdkLanguage: 'javascript';
  title: string;
  contextId: string;
  options: { viewport: { width: number; height: number } };
}

export interface ScreencastFrameEvent {
  type: 'screencast-frame';
  pageId: string;
  sha1: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface BeforeActionEvent {
  type: 'before';
  callId: string;
  startTime: number;
  class: string;
  method: string;
  pageId: string;
  params: Record<string, unknown>;
  title: string;
}

export interface AfterActionEvent {
  type: 'after';
  callId: string;
  endTime: number;
  error?: { message: string };
}

export type TraceEvent =
  | ContextOptionsEvent
  | ScreencastFrameEvent
  | BeforeActionEvent
  | AfterActionEvent;

export interface TraceScreenshot {
  resourceName: string;
  data: Buffer;
  width: number;
  height: number;
}

export interface TraceSession {
  sessionId: string;
  startWallTime: number;
  startHrTime: bigint;
  pageId: string;
  contextId: string;
  callCounter: number;
  events: TraceEvent[];
  screenshots: TraceScreenshot[];
  browserName: string;
  viewport: { width: number; height: number };
  sessionType: 'browser' | 'ios' | 'android';
  lastAfterEndTime: number;
  // Sequential chain of pending screenshot captures — awaited before zip export
  screenshotChain: Promise<void>;
}
