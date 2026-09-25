import { AIProvider, GenerationOptions, GenerationResult } from './types';
import { OllamaProvider } from './providers/ollama-provider';
import { GroqProvider, RateLimitError } from './providers/groq-provider';
import { HuggingFaceProvider } from './providers/huggingface-provider';
import logger from '../utils/logger';

export type ProviderName = 'ollama' | 'groq' | 'huggingface';

interface AIClientConfig {
  preferredProvider?: ProviderName;
  fallbackOrder?: ProviderName[];
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Unified AI client with automatic fallback.
 * Never talk to a provider directly — always go through this.
 *
 * Default chain: Ollama (local, free) → Groq (fast, free tier) → HuggingFace (free tier)
 */
export class AIClient {
  private providers: Map<ProviderName, AIProvider>;
  private fallbackOrder: ProviderName[];
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: AIClientConfig = {}) {
    this.providers = new Map<ProviderName, AIProvider>([
      ['ollama', new OllamaProvider()],
      ['groq', new GroqProvider()],
      ['huggingface', new HuggingFaceProvider()],
    ]);

    // If user set a preferred provider, put it first
    const defaultOrder: ProviderName[] = ['ollama', 'groq', 'huggingface'];
    if (config.preferredProvider) {
      this.fallbackOrder = [
        config.preferredProvider,
        ...defaultOrder.filter(p => p !== config.preferredProvider),
      ];
    } else {
      this.fallbackOrder = config.fallbackOrder || defaultOrder;
    }

    this.maxRetries = config.maxRetries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 2000;
  }

  /**
   * Generate text using the fallback chain.
   * Tries each provider in order. If one fails, moves to the next.
   */
  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const providerName of this.fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      // Quick availability check
      const available = await provider.isAvailable();
      if (!available) {
        logger.warn(`Provider ${providerName} is not available, skipping`);
        errors.push({ provider: providerName, error: 'not available' });
        continue;
      }

      // Try with retries
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          logger.info(`Generating with ${providerName} (attempt ${attempt}/${this.maxRetries})`);
          const result = await provider.generate(prompt, options);

          // Validate result is not empty
          if (!result.text || result.text.length < 10) {
            throw new Error('AI returned empty or too-short response');
          }

          return result;
        } catch (err: any) {
          const errMsg = err.message || String(err);
          logger.warn(`${providerName} attempt ${attempt} failed: ${errMsg}`);
          errors.push({ provider: providerName, error: errMsg });

          // Rate limit — wait and retry same provider
          if (err instanceof RateLimitError && attempt < this.maxRetries) {
            const waitMs = Math.max(err.retryAfterSeconds * 1000, this.retryDelayMs);
            logger.info(`Rate limited. Waiting ${waitMs}ms before retry...`);
            await sleep(waitMs);
            continue;
          }

          // Other errors — retry with backoff
          if (attempt < this.maxRetries) {
            await sleep(this.retryDelayMs * attempt);
            continue;
          }

          // All retries exhausted for this provider, move to next
          break;
        }
      }
    }

    // All providers failed
    const summary = errors.map(e => `${e.provider}: ${e.error}`).join('; ');
    throw new Error(`All AI providers failed. Errors: ${summary}`);
  }

  /**
   * Generate with a specific provider (no fallback).
   * Useful for testing or when user explicitly picks one.
   */
  async generateWith(providerName: ProviderName, prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);

    const available = await provider.isAvailable();
    if (!available) throw new Error(`Provider ${providerName} is not available`);

    return provider.generate(prompt, options);
  }

  /**
   * Check which providers are currently available.
   */
  async getAvailableProviders(): Promise<ProviderName[]> {
    const available: ProviderName[] = [];
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Singleton-ish factory. Reads preferred provider from env.
 */
export function createAIClient(): AIClient {
  const preferred = (process.env.AI_PROVIDER as ProviderName) || undefined;
  return new AIClient({ preferredProvider: preferred });
}
