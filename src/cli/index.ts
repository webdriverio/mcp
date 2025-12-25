#!/usr/bin/env node
/**
 * WebDriverIO Agent CLI
 * AI-powered browser automation using local LLMs (Ollama)
 */

import { runAgent } from '../agent/agent-loop.js';
import { parseArgs, printHelp } from './config.js';
import { exportForFineTuning, getExampleCount } from '../agent/data-collector.js';

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Show help if no arguments
  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  // Handle special commands
  if (args.includes('--export-training-data')) {
    try {
      const counts = getExampleCount();
      console.log(`\nTraining Data Export`);
      console.log(`====================`);
      console.log(`Total examples: ${counts.total}`);
      console.log(`Successful: ${counts.successful}`);

      if (counts.successful === 0) {
        console.log('\nNo successful examples to export yet.');
        console.log('Run some test scenarios first:');
        console.log('  wdio-agent "go to google.com and search for WebDriverIO"');
        process.exit(0);
      }

      const outputPath = exportForFineTuning();
      console.log(`\nExported ${counts.successful} examples to:`);
      console.log(`  ${outputPath}`);
      console.log('\nUse this file for fine-tuning. See docs/FINETUNING.md for instructions.');
      process.exit(0);
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    }
  }

  if (args.includes('--training-stats')) {
    const counts = getExampleCount();
    console.log(`\nTraining Data Statistics`);
    console.log(`========================`);
    console.log(`Total examples: ${counts.total}`);
    console.log(`Successful: ${counts.successful}`);
    console.log(`Failed: ${counts.total - counts.successful}`);
    console.log(`\nData location: ~/.wdio-agent/training-data/`);
    process.exit(0);
  }

  const { goal, config } = parseArgs(args);

  // Validate goal
  if (!goal) {
    console.error('Error: No task description provided.\n');
    printHelp();
    process.exit(1);
  }

  // Print header
  console.log('\n========================================');
  console.log('  WebDriverIO Agent');
  console.log('  AI-powered browser automation');
  console.log('========================================\n');

  console.log(`Task: ${goal}`);
  console.log(`Model: ${config.model}`);
  console.log(`Mode: ${config.headless ? 'headless' : 'headed'}`);
  console.log('');

  try {
    // Run the agent
    const result = await runAgent(goal, config);

    // Print results
    console.log('\n========================================');
    console.log('  Results');
    console.log('========================================\n');

    if (result.success) {
      console.log('Status: SUCCESS');
      console.log(`Message: ${result.message}`);
    } else {
      console.log('Status: FAILED');
      console.log(`Reason: ${result.reason}`);
      console.log(`Message: ${result.message}`);
    }

    console.log(`\nIterations: ${result.iterations}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

    // Print action log summary
    if (config.verbose && result.actionLog.length > 0) {
      console.log('\nAction Log:');
      result.actionLog.forEach((action, i) => {
        const argsStr = JSON.stringify(action.arguments);
        const truncatedArgs = argsStr.length > 50 ? argsStr.slice(0, 47) + '...' : argsStr;
        console.log(`  ${i + 1}. ${action.toolName}(${truncatedArgs})`);
      });
    }

    console.log('');

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Handle signals for cleanup
process.on('SIGINT', () => {
  console.log('\nInterrupted. Cleaning up...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\nTerminated. Cleaning up...');
  process.exit(143);
});

// Run
main();
