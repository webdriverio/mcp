import { getBrowser } from './browser.tool';
import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { ToolDefinition } from '../types/tool';
import sharp from 'sharp';

const MAX_DIMENSION = 2000;
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

export const takeScreenshotToolDefinition: ToolDefinition = {
  name: 'take_screenshot',
  description: 'captures a screenshot of the current page',
  inputSchema: {
    outputPath: z.string().optional().describe('Optional path where to save the screenshot. If not provided, returns base64 data.'),
  },
};

async function processScreenshot(screenshotBase64: string): Promise<{ data: Buffer; mimeType: string }> {
  const inputBuffer = Buffer.from(screenshotBase64, 'base64');
  let image = sharp(inputBuffer);
  const metadata = await image.metadata();

  // Resize if any dimension exceeds MAX_DIMENSION
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const resizeOptions = width > height
      ? { width: MAX_DIMENSION }
      : { height: MAX_DIMENSION };
    image = image.resize(resizeOptions);
  }

  // Try PNG with maximum compression first
  let outputBuffer = await image.png({ compressionLevel: 9 }).toBuffer();

  // If still over 1MB, convert to JPEG with progressive quality reduction
  if (outputBuffer.length > MAX_FILE_SIZE_BYTES) {
    let quality = 90;
    while (quality >= 10 && outputBuffer.length > MAX_FILE_SIZE_BYTES) {
      outputBuffer = await image.jpeg({ quality, mozjpeg: true }).toBuffer();
      quality -= 10;
    }
    return { data: outputBuffer, mimeType: 'image/jpeg' };
  }

  return { data: outputBuffer, mimeType: 'image/png' };
}

export const takeScreenshotTool: ToolCallback = async ({ outputPath }: { outputPath?: string }) => {
  try {
    const browser = getBrowser();
    const screenshot = await browser.takeScreenshot();
    const { data, mimeType } = await processScreenshot(screenshot);

    if (outputPath) {
      const fs = await import('node:fs');
      await fs.promises.writeFile(outputPath, data);
      const sizeKB = (data.length / 1024).toFixed(1);
      return {
        content: [{ type: 'text', text: `Screenshot saved to ${outputPath} (${sizeKB}KB, ${mimeType})` }],
      };
    }

    const sizeKB = (data.length / 1024).toFixed(1);
    return {
      content: [
        { type: 'text', text: `Screenshot captured (${sizeKB}KB, ${mimeType}):` },
        { type: 'image', data: data.toString('base64'), mimeType },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error taking screenshot: ${(e as Error).message}` }],
    };
  }
};