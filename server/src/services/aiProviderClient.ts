import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: 'json_object';
  maxTokens?: number;
  temperature?: number;
}

export interface AIProviderClient {
  generateJsonCompletion<T>(request: CompletionRequest): Promise<T>;
}

interface OpenRouterChoice {
  message?: {
    content?: string;
    role?: string;
  };
  finish_reason?: string;
}

interface OpenRouterChatResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
    code?: string | number;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Provider implementation for OpenRouter LLM chat completions.
 * Default model: openai/gpt-4o-mini (cost-effective, high instruction adherence for JSON output).
 * Configurable via OPENROUTER_TEXT_MODEL env var or default fallback.
 */
export class OpenRouterContentProvider implements AIProviderClient {
  private apiKey: string;
  private appUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = config.openrouterApiKey?.trim() || '';
    this.appUrl = config.appUrl || 'http://localhost:5173';
    this.defaultModel = config.openrouterTextModel || 'openai/gpt-4o-mini';
  }

  /**
   * Generates a validated JSON completion from OpenRouter with timeout protection.
   */
  async generateJsonCompletion<T>(request: CompletionRequest): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured on the server. Please add your key to server environment.'
      );
    }

    const payload = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    logger.info(`Sending content generation request to OpenRouter (${this.defaultModel})...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`AI generation request timed out after ${config.contentGenerationTimeoutMs / 1000}s.`));
    }, config.contentGenerationTimeoutMs);

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.appUrl,
          'X-Title': 'Vireo AI Video Content Generator',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error(`AI generation timed out after ${config.contentGenerationTimeoutMs}ms`);
        throw new Error(`AI generation timed out after ${config.contentGenerationTimeoutMs / 1000}s. Please retry.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`OpenRouter API error (${response.status})`, { errorText: errText });

      let cleanMsg = 'AI content generation provider returned an error.';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          cleanMsg = parsed.error.message;
        }
      } catch {
        // fallback
      }

      if (response.status === 401) {
        throw new Error('AI provider authentication failed: invalid API key.');
      }
      if (response.status === 402) {
        throw new Error(`AI provider payment/credits error: ${cleanMsg}. Please check your OpenRouter credit balance.`);
      }
      if (response.status === 429) {
        throw new Error(`AI provider rate limit exceeded: ${cleanMsg}. Please wait a moment and try again.`);
      }

      throw new Error(`AI provider error (${response.status}): ${cleanMsg}`);
    }

    const data = (await response.json()) as OpenRouterChatResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('AI provider returned an empty or malformed completion response.');
    }

    // Safely extract and parse JSON even if surrounded by whitespace or fences
    const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as T;
      return parsed;
    } catch {
      logger.error('Failed to parse JSON response from LLM', { rawContent: content });
      throw new Error('Failed to parse structured JSON from AI provider response.');
    }
  }
}

// Export singleton provider instance. Can be swapped for OpenAI, Anthropic, etc. without modifying callers.
export const defaultAiProvider: AIProviderClient = new OpenRouterContentProvider();
