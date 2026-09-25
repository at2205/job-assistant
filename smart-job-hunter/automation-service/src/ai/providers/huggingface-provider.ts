import { AIProvider, GenerationOptions, GenerationResult } from '../types';
import logger from '../../utils/logger';

/**
 * HuggingFace Inference API — free tier
 * Requires: HUGGINGFACE_API_KEY env variable
 * Models: mistralai/Mistral-7B-Instruct-v0.3, meta-llama/Llama-3.2-3B-Instruct, etc.
 * Limits: ~1000 req/day on free tier, rate-limited per model
 */
export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface';
  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY || '';
    this.defaultModel = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/${this.defaultModel}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ inputs: 'test', parameters: { max_new_tokens: 1 } }),
        signal: AbortSignal.timeout(10_000),
      });
      // 503 = model loading (still available, just cold)
      return res.ok || res.status === 503;
    } catch {
      return false;
    }
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    if (!this.apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

    const model = options?.model || this.defaultModel;
    const start = Date.now();

    // Format as instruction for instruct models
    const fullPrompt = this.formatInstruction(prompt, options?.systemPrompt);

    const res = await fetch(`${this.baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
          return_full_text: false,
          do_sample: true,
        },
        options: {
          wait_for_model: true,  // wait if model is cold-starting (up to ~60s)
        },
      }),
      signal: AbortSignal.timeout(90_000), // HF cold starts can be slow
    });

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 429) {
        throw new Error(`HuggingFace rate limited: ${errBody}`);
      }
      if (res.status === 503) {
        throw new Error(`HuggingFace model loading: ${errBody}. Retry in 30s.`);
      }
      throw new Error(`HuggingFace error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const latencyMs = Date.now() - start;

    // HF returns array of generated texts
    let text = '';
    if (Array.isArray(data) && data[0]?.generated_text) {
      text = data[0].generated_text.trim();
    } else if (typeof data === 'string') {
      text = data.trim();
    }

    logger.debug(`HuggingFace [${model}] responded in ${latencyMs}ms`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs,
    };
  }

  /**
   * Format prompt for Mistral/Llama instruct models.
   */
  private formatInstruction(prompt: string, systemPrompt?: string): string {
    // Mistral instruct format
    if (this.defaultModel.includes('Mistral')) {
      const sys = systemPrompt ? `${systemPrompt}\n\n` : '';
      return `<s>[INST] ${sys}${prompt} [/INST]`;
    }

    // Llama instruct format
    if (this.defaultModel.includes('Llama') || this.defaultModel.includes('llama')) {
      let formatted = '<|begin_of_text|>';
      if (systemPrompt) {
        formatted += `<|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>`;
      }
      formatted += `<|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|>`;
      formatted += '<|start_header_id|>assistant<|end_header_id|>\n\n';
      return formatted;
    }

    // Generic fallback
    if (systemPrompt) {
      return `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
    }
    return prompt;
  }
}
