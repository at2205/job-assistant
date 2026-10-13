import { AIProvider, GenerationOptions, GenerationResult } from '../types';
import logger from '../../utils/logger';

/**
 * Groq — fast inference API (free tier: ~30 req/min, 14K tokens/min)
 * Requires: GROQ_API_KEY env variable
 * Models: llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.defaultModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    if (!this.apiKey) throw new Error('GROQ_API_KEY not set');

    const model = options?.model || this.defaultModel;
    const start = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      // Handle rate limiting
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        throw new RateLimitError(`Groq rate limited. Retry after ${retryAfter || '?'}s`, parseInt(retryAfter || '10'));
      }
      throw new Error(`Groq error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const latencyMs = Date.now() - start;
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    logger.debug(`Groq [${model}] responded in ${latencyMs}ms (${data.usage?.total_tokens || '?'} tokens)`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs,
      tokenCount: data.usage?.total_tokens,
    };
  }
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfter;
  }
}
