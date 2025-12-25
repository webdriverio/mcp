/**
 * Type definitions for the WebDriverIO Agent
 */

// Ollama client configuration
export interface OllamaClientConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  timeout: number;
}

// Agent configuration
export interface AgentConfig {
  ollamaUrl: string;
  model: string;
  maxIterations: number;
  timeout: number;
  headless: boolean;
  verbose?: boolean;
}

// Message types for Ollama API
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCallResponse[];
  tool_call_id?: string;
}

// Tool call from Ollama response
export interface ToolCallResponse {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

// Parsed tool call for execution
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Tool execution result
export interface ToolResult {
  toolCallId: string;
  success: boolean;
  output: string;
  error?: string;
}

// Action history entry for loop detection
export interface ActionHistoryEntry {
  iteration: number;
  toolName: string;
  arguments: Record<string, unknown>;
  argumentsHash: string;
  result: string;
  timestamp: number;
}

// Agent state during execution
export interface AgentState {
  messages: Message[];
  actionHistory: ActionHistoryEntry[];
  iteration: number;
  startTime: number;
  browserStarted: boolean;
}

// Final agent result
export interface AgentResult {
  success: boolean;
  reason: 'completed' | 'max_iterations_reached' | 'timeout' | 'error' | 'loop_detected';
  message: string;
  iterations: number;
  duration: number;
  actionLog: ActionHistoryEntry[];
}

// Loop detection result
export interface LoopInfo {
  detected: boolean;
  type?: 'exact_repeat' | 'oscillation' | 'no_progress';
  message?: string;
  guidance?: string;
}

// Ollama API types
export interface OllamaRequest {
  model: string;
  messages: Message[];
  tools?: OllamaTool[];
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: Message;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Tool definition for registry
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}
