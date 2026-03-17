export interface RecordedStep {
  index: number;                      // 1-based, sequential within session
  tool: string;                       // e.g. 'navigate', '__session_transition__'
  params: Record<string, unknown>;
  status: 'ok' | 'error';
  error?: string;                     // only present when status === 'error'
  durationMs: number;
  timestamp: string;                  // ISO 8601
}

export interface SessionHistory {
  sessionId: string;
  type: 'browser' | 'ios' | 'android';
  startedAt: string;                  // ISO 8601
  endedAt?: string;                   // set on session close
  capabilities: Record<string, unknown>;  // full resolved capabilities
  appiumConfig?: { hostname: string; port: number; path: string };  // app sessions only
  steps: RecordedStep[];
}
