/**
 * Loop Detection
 * Detects when the agent is stuck in repetitive patterns
 */

import * as crypto from 'crypto';
import type { ActionHistoryEntry, LoopInfo } from './types.js';

/**
 * Configuration for loop detection
 */
interface LoopDetectionConfig {
  // Number of repeated exact actions to trigger detection
  exactRepeatThreshold: number;
  // Number of actions to check for oscillation patterns
  oscillationWindowSize: number;
  // Number of actions with similar results indicating no progress
  noProgressThreshold: number;
}

const DEFAULT_CONFIG: LoopDetectionConfig = {
  exactRepeatThreshold: 3,
  oscillationWindowSize: 6,
  noProgressThreshold: 5,
};

/**
 * Detect if the agent is stuck in a loop
 */
export function detectLoop(
  history: ActionHistoryEntry[],
  config: LoopDetectionConfig = DEFAULT_CONFIG,
): LoopInfo {
  if (history.length < 2) {
    return { detected: false };
  }

  // Check for exact repetition (same tool + args)
  const exactRepeat = detectExactRepeat(history, config.exactRepeatThreshold);
  if (exactRepeat.detected) {
    return exactRepeat;
  }

  // Check for oscillation (A-B-A-B pattern)
  const oscillation = detectOscillation(history, config.oscillationWindowSize);
  if (oscillation.detected) {
    return oscillation;
  }

  // Check for no progress (different actions, same results)
  const noProgress = detectNoProgress(history, config.noProgressThreshold);
  if (noProgress.detected) {
    return noProgress;
  }

  return { detected: false };
}

/**
 * Detect exact repetition of the same action
 */
function detectExactRepeat(
  history: ActionHistoryEntry[],
  threshold: number,
): LoopInfo {
  if (history.length < threshold) {
    return { detected: false };
  }

  const recent = history.slice(-threshold);
  const firstHash = recent[0].argumentsHash;
  const firstName = recent[0].toolName;

  const allSame = recent.every(
    (entry) => entry.argumentsHash === firstHash && entry.toolName === firstName,
  );

  if (allSame) {
    return {
      detected: true,
      type: 'exact_repeat',
      message: `Tool "${firstName}" called ${threshold} times with identical arguments`,
      guidance: `Stop repeating "${firstName}". Try a different tool or different arguments.`,
    };
  }

  return { detected: false };
}

/**
 * Detect oscillation patterns (A-B-A-B)
 */
function detectOscillation(
  history: ActionHistoryEntry[],
  windowSize: number,
): LoopInfo {
  if (history.length < windowSize) {
    return { detected: false };
  }

  const recent = history.slice(-windowSize);

  // Look for A-B-A-B pattern
  const hashes = recent.map((e) => `${e.toolName}:${e.argumentsHash}`);
  const uniqueHashes = new Set(hashes);

  // If only 2 unique actions in a window of 6, likely oscillating
  if (uniqueHashes.size === 2) {
    // Verify it's actually alternating
    const [first, second] = Array.from(uniqueHashes);
    let alternating = true;
    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i] === hashes[i - 1]) {
        alternating = false;
        break;
      }
    }

    if (alternating || uniqueHashes.size === 2) {
      const tools = Array.from(new Set(recent.map((e) => e.toolName)));
      return {
        detected: true,
        type: 'oscillation',
        message: `Oscillating between ${tools.join(' and ')}`,
        guidance: `Break the pattern. Try a completely different approach to achieve your goal.`,
      };
    }
  }

  return { detected: false };
}

/**
 * Detect lack of progress (many actions, same page state)
 */
function detectNoProgress(
  history: ActionHistoryEntry[],
  threshold: number,
): LoopInfo {
  if (history.length < threshold) {
    return { detected: false };
  }

  const recent = history.slice(-threshold);

  // Skip if any action is task_complete or get_visible_elements
  // (these don't change state)
  const stateChangingActions = recent.filter(
    (e) => !['task_complete', 'get_visible_elements', 'start_browser'].includes(e.toolName),
  );

  if (stateChangingActions.length < threshold - 1) {
    return { detected: false };
  }

  // Check if all results are error messages or indicate failure
  const failureCount = stateChangingActions.filter(
    (e) =>
      e.result.toLowerCase().includes('error') ||
      e.result.toLowerCase().includes('not found') ||
      e.result.toLowerCase().includes('failed'),
  ).length;

  if (failureCount >= threshold - 1) {
    return {
      detected: true,
      type: 'no_progress',
      message: `${failureCount} consecutive actions failed`,
      guidance: `Multiple actions have failed. Call get_visible_elements to see current page state, then try a different strategy.`,
    };
  }

  return { detected: false };
}

/**
 * Create a hash of tool arguments for comparison
 */
export function hashArguments(args: Record<string, unknown>): string {
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return crypto.createHash('md5').update(normalized).digest('hex').slice(0, 8);
}

/**
 * Create an action history entry
 */
export function createHistoryEntry(
  iteration: number,
  toolName: string,
  args: Record<string, unknown>,
  result: string,
): ActionHistoryEntry {
  return {
    iteration,
    toolName,
    arguments: args,
    argumentsHash: hashArguments(args),
    result,
    timestamp: Date.now(),
  };
}
