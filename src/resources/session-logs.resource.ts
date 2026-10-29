import type { ResourceDefinition } from '../types/resource';
import { getBrowser, getState, type NetworkLogsMode } from '../session/state';
import { activeSessionId } from '../session/context';

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
  timestampISO: string;
  source?: string;
}

interface SessionLogsResult {
  sessionType: string;
  logTypes: string[];
  entries: LogEntry[];
  errors?: string[];
}

function isPerformanceFailureEntry(rawMessage: string): boolean {
  try {
    const parsed = JSON.parse(rawMessage) as {
      message?: { method?: string; params?: { response?: { status?: number } } };
      method?: string;
      params?: { response?: { status?: number } };
    };
    const cdpMessage = parsed?.message ?? parsed;
    if (cdpMessage?.method === 'Network.loadingFailed') {
      return true;
    }
    if (
      cdpMessage?.method === 'Network.responseReceived' &&
      typeof cdpMessage.params?.response?.status === 'number' &&
      cdpMessage.params.response.status >= 400
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch logs appropriate to the current session type:
 * - browser: console logs + JS exceptions via getLogs('browser') and network/CDP events via getLogs('performance') (local Chromium only)
 * - android: system/crash logs via getLogs('logcat')
 * - ios: crash logs via getLogs('crashlog') + system logs via getLogs('syslog')
 */
async function fetchLogsForSession(
  sessionType: string,
  networkLogs?: NetworkLogsMode,
): Promise<{ logTypes: string[]; entries: LogEntry[]; errors?: string[] }> {
  const browser = getBrowser();
  const b = browser as unknown as Record<string, unknown>;

  // Discover available log types — throws on unsupported browsers (Firefox/Safari)
  const availableTypes: string[] =
    await (b.getLogTypes as () => Promise<string[]>)();

  const entries: LogEntry[] = [];

  switch (sessionType) {
    case 'browser': {
      // Console output + uncaught JS exceptions + network/performance events
      const errors: string[] = [];
      let attempted = 0;
      let succeeded = 0;
      for (const logType of ['browser', 'performance']) {
        if (availableTypes.includes(logType)) {
          attempted++;
          try {
            const raw: Array<{ level: string; message: string; timestamp: number }> =
              await (b.getLogs as (t: string) => Promise<Array<{ level: string; message: string; timestamp: number }>>)(logType);
            const filtered = logType === 'performance' && networkLogs === 'failures'
              ? raw.filter((e) => isPerformanceFailureEntry(e.message))
              : raw;
            entries.push(...filtered.map((e) => ({
              level: e.level,
              message: e.message,
              timestamp: e.timestamp,
              timestampISO: new Date(e.timestamp).toISOString(),
              source: logType,
            })));
            succeeded++;
          } catch (err) {
            errors.push(`${logType}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      if (attempted > 0 && succeeded === 0) {
        throw new Error(`All browser log types failed: ${errors.join('; ')}`);
      }
      return { logTypes: availableTypes, entries, ...(errors.length > 0 ? { errors } : {}) };
    }

    case 'android': {
      // logcat — system logs, crash dumps, fatal exceptions
      const logType = 'logcat';
      if (availableTypes.includes(logType)) {
        const raw: Array<{ level: string; message: string; timestamp: number }> =
          await (b.getLogs as (t: string) => Promise<Array<{ level: string; message: string; timestamp: number }>>)(logType);
        entries.push(...raw.map((e) => ({
          level: e.level,
          message: e.message,
          timestamp: e.timestamp,
          timestampISO: new Date(e.timestamp).toISOString(),
        })));
      }
      return { logTypes: availableTypes, entries };
    }

    case 'ios': {
      // crashlog + syslog — crash/panic reports + system diagnostics
      const errors: string[] = [];
      let attempted = 0;
      let succeeded = 0;
      for (const logType of ['crashlog', 'syslog']) {
        if (availableTypes.includes(logType)) {
          attempted++;
          try {
            const raw: Array<{ level: string; message: string; timestamp: number }> =
              await (b.getLogs as (t: string) => Promise<Array<{ level: string; message: string; timestamp: number }>>)(logType);
            entries.push(...raw.map((e) => ({
              level: e.level,
              message: e.message,
              timestamp: e.timestamp,
              timestampISO: new Date(e.timestamp).toISOString(),
              source: logType,
            })));
            succeeded++;
          } catch (err) {
            // Individual log types may fail even when listed — track and continue
            errors.push(`${logType}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      // Surface only when every attempted log type threw — partial failure is expected
      if (attempted > 0 && succeeded === 0) {
        throw new Error(`All iOS log types failed: ${errors.join('; ')}`);
      }
      return { logTypes: availableTypes, entries, ...(errors.length > 0 ? { errors } : {}) };
    }

    default:
      return { logTypes: availableTypes, entries };
  }
}

export async function readSessionLogs(): Promise<{ mimeType: string; text: string }> {
  try {
    const state = getState();
    const metadata = state.sessionMetadata.get(activeSessionId() ?? '');
    const sessionType = metadata?.type ?? 'browser';

    const { logTypes, entries, errors } = await fetchLogsForSession(sessionType, metadata?.networkLogs);

    const result: SessionLogsResult = {
      sessionType,
      logTypes,
      entries,
      ...(errors ? { errors } : {}),
    };

    return { mimeType: 'application/json', text: JSON.stringify(result) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (message.includes('getLogTypes') || message.includes('unknown command') || message.includes('not supported')) {
      return {
        mimeType: 'text/plain',
        text: `Error: Session logs are not available on this session. Browser-based sessions require Chromium (Chrome/Edge). Mobile sessions require Appium with log access enabled. Details: ${message}`,
      };
    }

    return { mimeType: 'text/plain', text: `Error: ${message}` };
  }
}

export const sessionLogsResource: ResourceDefinition = {
  name: 'session-current-logs',
  uri: 'wdio://session/current/logs',
  description: 'Session logs, console errors, network performance events, and crash reports for the current session. Auto-detects session type — browser: console logs + JS exceptions via getLogs(\'browser\') and network/performance events via getLogs(\'performance\') (local Chromium only); Android: system/crash logs via getLogs(\'logcat\'); iOS: crash/panic + system logs via getLogs(\'crashlog\') and getLogs(\'syslog\'). NOTE: Reading this resource clears the log buffer per protocol spec — subsequent reads return only entries accumulated since the last read. Browser logs require Chromium (Chrome/Edge).',
  handler: async () => {
    const result = await readSessionLogs();
    return {
      contents: [{
        uri: 'wdio://session/current/logs',
        mimeType: result.mimeType,
        text: result.text,
      }],
    };
  },
};
