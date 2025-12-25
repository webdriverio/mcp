/**
 * Agent Loop
 * Main orchestration for the WebDriverIO agent
 */

import { OllamaClient } from './ollama-client.js';
import { MVP_TOOLS } from './tool-registry.js';
import { executeTool, closeBrowser, isBrowserRunning } from './tool-executor.js';
import { detectLoop, createHistoryEntry } from './loop-detection.js';
import { SYSTEM_PROMPT, buildGoalMessage, buildLoopGuidanceMessage } from './prompts.js';
import {
  saveTrainingExample,
  generateExampleId,
  type TrainingExample,
} from './data-collector.js';
import type {
  AgentConfig,
  AgentState,
  AgentResult,
  Message,
  ToolCall,
  ToolCallResponse,
} from './types.js';

/**
 * Run the agent with the given goal
 */
export async function runAgent(
  goal: string,
  config: AgentConfig,
): Promise<AgentResult> {
  const startTime = Date.now();

  // Initialize Ollama client
  const ollama = new OllamaClient({
    baseUrl: config.ollamaUrl,
    model: config.model,
    temperature: 0.1,
    timeout: config.timeout,
  });

  // Check Ollama connection
  const connectionCheck = await ollama.checkConnection();
  if (!connectionCheck.ok) {
    return {
      success: false,
      reason: 'error',
      message: connectionCheck.error || 'Failed to connect to Ollama',
      iterations: 0,
      duration: Date.now() - startTime,
      actionLog: [],
    };
  }

  // Initialize agent state
  const state: AgentState = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildGoalMessage(goal) },
    ],
    actionHistory: [],
    iteration: 0,
    startTime,
    browserStarted: false,
  };

  if (config.verbose) {
    console.log(`\n[Agent] Goal: ${goal}`);
    console.log(`[Agent] Model: ${config.model}`);
    console.log(`[Agent] Max iterations: ${config.maxIterations}\n`);
  }

  try {
    // Main agent loop
    while (state.iteration < config.maxIterations) {
      state.iteration++;

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > config.timeout) {
        return createResult(state, 'timeout', 'Agent timed out', startTime, goal, config.model);
      }

      if (config.verbose) {
        console.log(`\n[Iteration ${state.iteration}/${config.maxIterations}]`);
      }

      // Call Ollama
      const response = await ollama.chat(state.messages, MVP_TOOLS);

      // Extract tool calls from response
      const toolCalls = extractToolCalls(response.message);

      // If no tool calls, check if task is done via text
      if (toolCalls.length === 0) {
        const content = response.message.content || '';

        // Check if model thinks task is complete
        if (content.toLowerCase().includes('task') && content.toLowerCase().includes('complete')) {
          return createResult(state, 'completed', content, startTime, goal, config.model);
        }

        // No tool call and no completion - add message and continue
        state.messages.push({
          role: 'assistant',
          content,
        });

        // Prompt for action
        state.messages.push({
          role: 'user',
          content: 'Please call a tool to continue. Use start_browser if not started, or task_complete if done.',
        });

        continue;
      }

      // Process the first tool call
      const toolCall = toolCalls[0];

      if (config.verbose) {
        console.log(`[Tool] ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);
      }

      // Check for task_complete
      if (toolCall.name === 'task_complete') {
        const summary = (toolCall.arguments.summary as string) || 'Task completed';
        return createResult(state, 'completed', summary, startTime, goal, config.model);
      }

      // Execute the tool
      const result = await executeTool(toolCall, config);

      if (config.verbose) {
        console.log(`[Result] ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`);
      }

      // Track browser state
      if (toolCall.name === 'start_browser' && result.includes('Success')) {
        state.browserStarted = true;
      }

      // Create history entry for loop detection
      const historyEntry = createHistoryEntry(
        state.iteration,
        toolCall.name,
        toolCall.arguments,
        result,
      );
      state.actionHistory.push(historyEntry);

      // Check for loops
      const loopInfo = detectLoop(state.actionHistory);
      if (loopInfo.detected) {
        if (config.verbose) {
          console.log(`[Loop Detected] ${loopInfo.type}: ${loopInfo.message}`);
        }

        // If we've detected loops multiple times, fail
        const loopCount = state.actionHistory.filter(
          (_, i, arr) => i >= 3 && detectLoop(arr.slice(0, i + 1)).detected,
        ).length;

        if (loopCount >= 3) {
          return createResult(
            state,
            'loop_detected',
            `Agent stuck in loop: ${loopInfo.message}`,
            startTime,
            goal,
            config.model,
          );
        }

        // Inject guidance to break the loop
        const guidance = buildLoopGuidanceMessage(loopInfo.type!);
        state.messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: toolCall.name, arguments: toolCall.arguments } }],
        });
        state.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
        state.messages.push({
          role: 'user',
          content: guidance,
        });

        continue;
      }

      // Add tool call and result to messages
      state.messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: toolCall.name, arguments: toolCall.arguments } }],
      });
      state.messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }

    // Max iterations reached
    return createResult(
      state,
      'max_iterations_reached',
      `Reached maximum iterations (${config.maxIterations})`,
      startTime,
      goal,
      config.model,
    );
  } finally {
    // Cleanup browser if running
    if (isBrowserRunning()) {
      await closeBrowser();
    }
  }
}

/**
 * Extract tool calls from Ollama response message
 */
function extractToolCalls(message: Message): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      const parsed = parseToolCall(tc);
      if (parsed) {
        toolCalls.push(parsed);
      }
    }
  }

  return toolCalls;
}

/**
 * Parse a single tool call response
 */
function parseToolCall(tc: ToolCallResponse): ToolCall | null {
  try {
    const name = tc.function?.name;
    let args = tc.function?.arguments;

    if (!name) {
      return null;
    }

    // Arguments might be a string (JSON) or already an object
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }

    return {
      id: tc.id || `call_${Date.now()}`,
      name,
      arguments: (args as Record<string, unknown>) || {},
    };
  } catch {
    return null;
  }
}

/**
 * Create the final result object and save training data if successful
 */
function createResult(
  state: AgentState,
  reason: AgentResult['reason'],
  message: string,
  startTime: number,
  goal?: string,
  model?: string,
): AgentResult {
  const duration = Date.now() - startTime;
  const success = reason === 'completed';

  // Save successful runs as training data
  if (success && goal && model) {
    try {
      const example: TrainingExample = {
        id: generateExampleId(),
        goal,
        messages: state.messages,
        toolCalls: state.actionHistory.map((h) => ({
          id: `call_${h.iteration}`,
          name: h.toolName,
          arguments: h.arguments,
        })),
        success: true,
        duration,
        model,
        timestamp: new Date().toISOString(),
      };

      const filepath = saveTrainingExample(example);
      console.log(`\n[Training] Saved example to ${filepath}`);
    } catch (error) {
      // Don't fail the result if training data save fails
      console.error('[Training] Failed to save example:', error);
    }
  }

  return {
    success,
    reason,
    message,
    iterations: state.iteration,
    duration,
    actionLog: state.actionHistory,
  };
}
