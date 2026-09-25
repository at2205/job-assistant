import { AIProvider, GenerationOptions, GenerationResult } from '../types';
import logger from '../../utils/logger';

/**
 * Ollama — local LLM inference (LLaMA, Mistral, etc.)
 * Requires: Ollama running locally (`ollama serve`)
 * Cost: $0 (runs on your hardware)
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.defaultModel = process.env.OLLAMA_MODEL || 'mistral';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const model = options?.model || this.defaultModel;
    const start = Date.now();

    const body: any = {
      model,
      prompt: this.buildFullPrompt(prompt, options?.systemPrompt),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 1024,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 min timeout for local models
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const latencyMs = Date.now() - start;

    logger.debug(`Ollama [${model}] responded in ${latencyMs}ms`);

    return {
      text: data.response?.trim() || '',
      provider: this.name,
      model,
      latencyMs,
      tokenCount: data.eval_count,
    };
  }

  private buildFullPrompt(prompt: string, systemPrompt?: string): string {
    if (!systemPrompt) return prompt;
    return `${systemPrompt}\n\n---\n\n${prompt}`;
  }
}
