import { AsyncLocalStorage } from 'node:async_hooks';
import { getState } from './state';

export interface SessionCallContext { sessionId?: string }

export const sessionContext = new AsyncLocalStorage<SessionCallContext>();

// state.ts and this module import each other; both only use the other's exports at call time
export function activeSessionId(): string | null {
  return sessionContext.getStore()?.sessionId ?? getState().currentSession;
}
