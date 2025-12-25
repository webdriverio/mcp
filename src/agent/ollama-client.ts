/**
 * Ollama HTTP Client
 * Handles communication with local Ollama server for tool calling
 */

import type {
  OllamaClientConfig,
  OllamaRequest,
  OllamaResponse,
  OllamaTool,
  Message,
} from './types.js';

const DEFAULT_CONFIG: OllamaClientConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  temperature: 0.1, // Low temperature for deterministic tool calls
  timeout: 120000, // 2 minutes per request (local models can be slow)
};

export class OllamaClient {
  private config: OllamaClientConfig;

  constructor(config: Partial<OllamaClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send a chat request to Ollama with optional tools
   */
  async chat(
    messages: Message[],
    tools?: OllamaTool[],
    retries = 3,
  ): Promise<OllamaResponse> {
    const request: OllamaRequest = {
      model: this.config.model,
      messages,
      stream: false,
      options: {
        temperature: this.config.temperature,
      },
    };

    if (tools && tools.length > 0) {
      request.tools = tools;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.makeRequest(request);
        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Ollama request failed after ${retries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Make the actual HTTP request to Ollama
   */
  private async makeRequest(request: OllamaRequest): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new OllamaError(
          `Ollama API error (${response.status}): ${errorText}`,
          response.status,
        );
      }

      const data = (await response.json()) as OllamaResponse;
      return this.validateResponse(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OllamaError('Ollama request timed out', 408);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate the response structure
   */
  private validateResponse(data: unknown): OllamaResponse {
    if (!data || typeof data !== 'object') {
      throw new OllamaError('Invalid response from Ollama: not an object', 500);
    }

    const response = data as OllamaResponse;

    if (!response.message) {
      throw new OllamaError('Invalid response from Ollama: missing message', 500);
    }

    return response;
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof OllamaError) {
      // Don't retry client errors (4xx) except for rate limiting (429)
      if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
        return true;
      }
    }

    // Don't retry if Ollama isn't running
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if Ollama is running and the model is available
   */
  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { ok: false, error: `Ollama returned status ${response.status}` };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const modelNames = models.map((m) => m.name);

      // Check if the configured model is available
      const modelBase = this.config.model.split(':')[0];
      const hasModel = modelNames.some(
        (name) => name === this.config.model || name.startsWith(modelBase),
      );

      if (!hasModel) {
        return {
          ok: false,
          error: `Model "${this.config.model}" not found. Available: ${modelNames.join(', ')}`,
        };
      }

      return { ok: true };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        return {
          ok: false,
          error: `Cannot connect to Ollama at ${this.config.baseUrl}. Is Ollama running?`,
        };
      }
      return {
        ok: false,
        error: `Connection check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): OllamaClientConfig {
    return { ...this.config };
  }
}

/**
 * Custom error class for Ollama-specific errors
 */
export class OllamaError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}
