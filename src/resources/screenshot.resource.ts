import type { ResourceDefinition } from '../types/resource';
import { getBrowser } from '../session/state';
import sharp from 'sharp';

const MAX_DIMENSION = 2000;
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

async function processScreenshot(screenshotBase64: string): Promise<{ data: Buffer; mimeType: string }> {
  const inputBuffer = Buffer.from(screenshotBase64, 'base64');
  let image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const resizeOptions = width > height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION };
    image = image.resize(resizeOptions);
  }

  let outputBuffer = await image.png({ compressionLevel: 9 }).toBuffer();

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

async function readScreenshot(): Promise<{ mimeType: string; blob: string }> {
  try {
    const browser = getBrowser();
    const screenshot = await browser.takeScreenshot();
    const { data, mimeType } = await processScreenshot(screenshot);
    return { mimeType, blob: data.toString('base64') };
  } catch (e) {
    return { mimeType: 'text/plain', blob: Buffer.from(`Error: ${e}`).toString('base64') };
  }
}

export const screenshotResource: ResourceDefinition = {
  name: 'session-current-screenshot',
  uri: 'wdio://session/current/screenshot',
  description: 'Screenshot of the current page',
  handler: async () => {
    const result = await readScreenshot();
    return { contents: [{ uri: 'wdio://session/current/screenshot', mimeType: result.mimeType, blob: result.blob }] };
  },
};