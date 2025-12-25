/**
 * Training Data Collector
 * Captures successful agent runs for fine-tuning Qwen3
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Message, ToolCall } from './types.js';

export interface TrainingExample {
  id: string;
  goal: string;
  messages: Message[];
  toolCalls: ToolCall[];
  success: boolean;
  duration: number;
  model: string;
  timestamp: string;
}

/**
 * Directory for storing training data
 */
function getDataDir(): string {
  const dir = join(homedir(), '.wdio-agent', 'training-data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save a successful run as a training example
 */
export function saveTrainingExample(example: TrainingExample): string {
  const dir = getDataDir();
  const filename = `${example.id}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(example, null, 2));

  return filepath;
}

/**
 * Convert a training example to Qwen3 fine-tuning format (ChatML)
 */
export function toQwen3Format(example: TrainingExample): object {
  // Filter to only include messages that form valid training pairs
  const formattedMessages: Array<{
    role: string;
    content: string;
    tool_calls?: Array<{
      type: string;
      function: { name: string; arguments: string };
    }>;
    name?: string;
  }> = [];

  for (const msg of example.messages) {
    if (msg.role === 'system') {
      formattedMessages.push({
        role: 'system',
        content: msg.content,
      });
    } else if (msg.role === 'user') {
      formattedMessages.push({
        role: 'user',
        content: msg.content,
      });
    } else if (msg.role === 'assistant') {
      const formatted: {
        role: string;
        content: string;
        tool_calls?: Array<{
          type: string;
          function: { name: string; arguments: string };
        }>;
      } = {
        role: 'assistant',
        content: msg.content || '',
      };

      // Add tool calls if present
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        formatted.tool_calls = msg.tool_calls.map((tc) => ({
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments),
          },
        }));
      }

      formattedMessages.push(formatted);
    } else if (msg.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        content: msg.content,
        name: msg.name,
      });
    }
  }

  return {
    messages: formattedMessages,
    metadata: {
      goal: example.goal,
      success: example.success,
      duration: example.duration,
    },
  };
}

/**
 * Export all training examples to a single JSONL file for fine-tuning
 */
export function exportForFineTuning(outputPath?: string): string {
  const dir = getDataDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('training-data.jsonl'));

  const output = outputPath || join(dir, 'training-data.jsonl');
  const lines: string[] = [];

  for (const file of files) {
    try {
      const filepath = join(dir, file);
      const raw = readFileSync(filepath, 'utf-8');
      const content = JSON.parse(raw) as TrainingExample;

      // Only include successful runs
      if (content.success) {
        const formatted = toQwen3Format(content);
        lines.push(JSON.stringify(formatted));
      }
    } catch {
      // Skip invalid files
    }
  }

  writeFileSync(output, lines.join('\n'));

  return output;
}

/**
 * Generate a unique ID for a training example
 */
export function generateExampleId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Get count of collected examples
 */
export function getExampleCount(): { total: number; successful: number } {
  const dir = getDataDir();

  if (!existsSync(dir)) {
    return { total: 0, successful: 0 };
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('training-data'));
  let successful = 0;

  for (const file of files) {
    try {
      const filepath = join(dir, file);
      const raw = readFileSync(filepath, 'utf-8');
      const content = JSON.parse(raw) as TrainingExample;
      if (content.success) {
        successful++;
      }
    } catch {
      // Skip invalid files
    }
  }

  return { total: files.length, successful };
}
