/**
 * CLI Configuration
 * Default settings and environment variable overrides
 */

import type { AgentConfig } from '../agent/types.js';

/**
 * Default configuration for the agent
 */
export const defaultConfig: AgentConfig = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  model: process.env.WDIO_AGENT_MODEL || 'qwen3:8b',
  maxIterations: parseInt(process.env.WDIO_AGENT_MAX_ITERATIONS || '15', 10),
  timeout: parseInt(process.env.WDIO_AGENT_TIMEOUT || '300000', 10), // 5 minutes total
  headless: false, // Default to headed (visible browser)
  verbose: true,
};

/**
 * Parse CLI arguments and merge with defaults
 */
export function parseArgs(args: string[]): { goal: string; config: AgentConfig } {
  const config = { ...defaultConfig };
  let goal = '';
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--headless') {
      config.headless = true;
    } else if (arg === '--headed') {
      config.headless = false;
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--quiet' || arg === '-q') {
      config.verbose = false;
    } else if (arg === '--model' || arg === '-m') {
      const nextArg = args[++i];
      if (nextArg) {
        config.model = nextArg;
      }
    } else if (arg === '--url' || arg === '-u') {
      const nextArg = args[++i];
      if (nextArg) {
        config.ollamaUrl = nextArg;
      }
    } else if (arg === '--max-iterations') {
      const nextArg = args[++i];
      if (nextArg) {
        config.maxIterations = parseInt(nextArg, 10);
      }
    } else if (arg === '--timeout') {
      const nextArg = args[++i];
      if (nextArg) {
        config.timeout = parseInt(nextArg, 10);
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // Join positional args as the goal
  goal = positionalArgs.join(' ').trim();

  return { goal, config };
}

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
wdio-agent - AI-powered browser automation using local LLMs

USAGE:
  wdio-agent [options] "your task description"

EXAMPLES:
  wdio-agent "go to google.com and search for WebDriverIO"
  wdio-agent --headless "navigate to github.com"
  wdio-agent --model llama3.1 "search for cats on google"

OPTIONS:
  --headless            Run browser without visible window
  --headed              Run browser with visible window (default)
  -m, --model           Ollama model to use (default: qwen3:8b)
  -u, --url             Ollama server URL (default: http://localhost:11434)
  --max-iterations      Maximum agent iterations (default: 15)
  --timeout             Total timeout in ms (default: 300000)
  -v, --verbose         Show detailed output (default)
  -q, --quiet           Show minimal output
  -h, --help            Show this help message

TRAINING DATA (for fine-tuning):
  --training-stats      Show collected training data statistics
  --export-training-data Export training data to JSONL for fine-tuning
                        See docs/FINETUNING.md for instructions

ENVIRONMENT VARIABLES:
  OLLAMA_URL                 Ollama server URL
  WDIO_AGENT_MODEL           Default model to use
  WDIO_AGENT_MAX_ITERATIONS  Maximum iterations
  WDIO_AGENT_TIMEOUT         Timeout in milliseconds

REQUIREMENTS:
  - Ollama running locally (https://ollama.ai)
  - Chrome browser installed
  - ChromeDriver (installed automatically by WebDriverIO)
`);
}
