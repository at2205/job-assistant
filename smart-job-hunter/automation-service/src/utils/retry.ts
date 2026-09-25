import logger from './logger';

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Retry wrapper with exponential backoff + jitter.
 * Used for all flaky browser operations.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isLastAttempt = attempt === opts.maxAttempts;

      if (opts.retryableErrors && !opts.retryableErrors.some(e => error.message?.includes(e))) {
        logger.error(`[${label}] Non-retryable error: ${error.message}`);
        throw error;
      }

      if (isLastAttempt) {
        logger.error(`[${label}] Failed after ${opts.maxAttempts} attempts: ${error.message}`);
        throw error;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1) + Math.random() * 1000,
        opts.maxDelayMs
      );

      logger.warn(`[${label}] Attempt ${attempt}/${opts.maxAttempts} failed. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }

  throw new Error(`[${label}] Unreachable`);
}

/** Human-like random delay between min and max ms */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(minMs?: number, maxMs?: number): Promise<void> {
  const min = minMs ?? parseInt(process.env.MIN_ACTION_DELAY_MS || '2000');
  const max = maxMs ?? parseInt(process.env.MAX_ACTION_DELAY_MS || '5000');
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}
