import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolDefinition } from '../types/tool';
import { getBrowser } from '../session/state';
import { clickAction } from './click.tool';
import { setValueAction } from './set-value.tool';
import { navigateAction } from './navigate.tool';
import { scrollAction } from './scroll.tool';
import { dragAndDropAction, swipeAction, tapAction } from './gestures.tool';
import { appendStep } from '../recording/step-recorder';
import { waitForStability } from '../utils/stability-detector';
import { captureStateDelta } from '../utils/state-diff';
import { getInteractableBrowserElements } from '../scripts/get-interactable-browser-elements';
import { coerceBoolean } from '../utils/zod-helpers';

// Action schemas
const clickActionSchema = z.object({
  action: z.literal('click'),
  selector: z.string(),
  scrollToView: coerceBoolean.optional(),
  timeout: z.number().optional(),
});

const setValueActionSchema = z.object({
  action: z.literal('set_value'),
  selector: z.string(),
  value: z.string(),
  scrollToView: coerceBoolean.optional(),
  timeout: z.number().optional(),
});

const navigateActionSchema = z.object({
  action: z.literal('navigate'),
  url: z.string(),
});

const scrollActionSchema = z.object({
  action: z.literal('scroll'),
  direction: z.enum(['up', 'down']),
  pixels: z.number().optional(),
});

const tapActionSchema = z.object({
  action: z.literal('tap'),
  selector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const swipeActionSchema = z.object({
  action: z.literal('swipe'),
  direction: z.enum(['up', 'down', 'left', 'right']),
  duration: z.number().optional(),
  percent: z.number().optional(),
});

const dragAndDropActionSchema = z.object({
  action: z.literal('drag_and_drop'),
  sourceSelector: z.string(),
  targetSelector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  duration: z.number().optional(),
});

const actionSchema = z.discriminatedUnion('action', [
  clickActionSchema,
  setValueActionSchema,
  navigateActionSchema,
  scrollActionSchema,
  tapActionSchema,
  swipeActionSchema,
  dragAndDropActionSchema,
]);

export const executeSequenceToolDefinition: ToolDefinition = {
  name: 'execute_sequence',
  description: 'Execute a sequence of actions atomically. Waits for page stability between actions. Returns a state delta showing what changed.',
  inputSchema: {
    actions: z.array(actionSchema).min(1).describe('Sequence of actions to execute'),
    waitForStability: coerceBoolean.optional().default(true).describe('Wait for page stability after each action'),
  },
};

async function dispatchAction(action: z.infer<typeof actionSchema>): Promise<CallToolResult> {
  switch (action.action) {
    case 'click':
      return clickAction(action.selector, action.timeout ?? 3000, action.scrollToView);
    case 'set_value':
      return setValueAction(action.selector, action.value, action.scrollToView, action.timeout);
    case 'navigate':
      return navigateAction(action.url);
    case 'scroll':
      return scrollAction(action.direction, action.pixels);
    case 'tap':
      return tapAction({ selector: action.selector, x: action.x, y: action.y });
    case 'swipe':
      return swipeAction({ direction: action.direction, duration: action.duration, percent: action.percent });
    case 'drag_and_drop':
      return dragAndDropAction({
        sourceSelector: action.sourceSelector,
        targetSelector: action.targetSelector,
        x: action.x,
        y: action.y,
        duration: action.duration
      });
    default: {
      const _exhaustiveCheck: never = action;
      return { isError: true, content: [{ type: 'text', text: `Unknown action: ${(action as any).action}` }] };
    }
  }
}

export const executeSequenceTool: ToolCallback = async ({
  actions,
  waitForStability: shouldWait = true,
}: {
  actions: z.infer<typeof actionSchema>[];
  waitForStability?: boolean;
}) => {
  try {
    const browser = getBrowser();
    const isBrowser = !browser.isAndroid && !browser.isIOS;

    // Capture initial URL/title for diff
    const { url: beforeUrl, title: beforeTitle } = isBrowser
      ? await browser.execute(() => ({ url: window.location.href, title: document.title })) as {
        url: string;
        title: string
      }
      : { url: '', title: '' };

    // Capture initial elements for diff (browser only)
    const initialBrowserElements = isBrowser ? await getInteractableBrowserElements(browser, {}) : [];
    const initialElements = initialBrowserElements.map((el) => ({ selector: el.selector, text: el.name }));

    const results: { action: string; durationMs: number }[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const start = Date.now();
      const result = await dispatchAction(action);
      const durationMs = Date.now() - start;
      const isError = (result as any).isError === true;

      // Record each sub-action as a step
      appendStep(
        action.action,
        action as Record<string, unknown>,
        isError ? 'error' : 'ok',
        durationMs,
        isError ? (result.content.find((c: any) => c.type === 'text') as any)?.text : undefined,
      );

      if (isError) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              completed: i,
              total: actions.length,
              failed: {
                index: i,
                action: action.action,
                error: (result.content.find((c: any) => c.type === 'text') as any)?.text,
              },
              results,
            }),
          }],
        };
      }

      results.push({ action: action.action, durationMs });

      // Wait for stability after each action (except the last, we do it before diff)
      if (shouldWait && i < actions.length - 1 && isBrowser) {
        await waitForStability(browser);
      }
    }

    // Final stability wait before capturing end state
    if (shouldWait && isBrowser) {
      await waitForStability(browser);
    }

    // Capture final elements for state delta (browser only)
    const finalBrowserElements = isBrowser ? await getInteractableBrowserElements(browser, {}) : [];
    const finalElements = finalBrowserElements.map((el) => ({ selector: el.selector, text: el.name }));

    const delta = isBrowser
      ? await captureStateDelta(browser, initialElements, finalElements, beforeUrl, beforeTitle)
      : null;

    const response: Record<string, unknown> = {
      completed: actions.length,
      total: actions.length,
      results,
    };
    if (delta) {
      response.delta = delta;
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(response) }],
    };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Error executing sequence: ${e}` }] };
  }
};
