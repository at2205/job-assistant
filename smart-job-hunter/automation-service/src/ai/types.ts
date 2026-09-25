/**
 * Universal AI provider interface.
 * Every provider implements this — the system never talks to a specific provider directly.
 */
export interface AIProvider {
  readonly name: string;
  readonly isAvailable: () => Promise<boolean>;
  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  model?: string;
}

export interface GenerationResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokenCount?: number;
}
