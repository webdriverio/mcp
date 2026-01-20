import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';

export const takeScreenshotToolDefinition: ToolDefinition = {
  name: 'take_screenshot',
  description: 'captures a screenshot of the current page',
  inputSchema: {
    outputPath: z.string().optional().describe('Optional path where to save the screenshot. If not provided, returns base64 data.'),
  },
};

export const takeScreenshotTool: ToolCallback = async ({ outputPath}: { outputPath?: string }) => {
  try {
    const browser = getBrowser();
    const screenshot = await browser.takeScreenshot();

    if (outputPath) {
      const fs = await import('node:fs');
      await fs.promises.writeFile(outputPath, screenshot, 'base64');
      return {
        content: [{ type: 'text', text: `Screenshot saved to ${outputPath}` }],
      };
    }
    return {
      content: [
        { type: 'text', text: 'Screenshot captured as base64:' },
        { type: 'image', data: screenshot.toString(), mimeType: 'image/png' },
      ],
    };

  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error taking screenshot: ${e.message}` }],
    };
  }
};