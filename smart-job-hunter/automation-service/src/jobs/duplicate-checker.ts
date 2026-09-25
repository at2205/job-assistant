import { JobRepository } from '../db/job-repository';
import logger from '../utils/logger';

/**
 * Pre-insert duplicate checker.
 * Uses DB lookup to skip jobs we already have, reducing unnecessary inserts.
 * The DB upsert handles concurrent duplicates, but pre-filtering reduces DB load.
 */
export class DuplicateChecker {
  private repository: JobRepository;
  private cache: Map<string, Set<string>>; // platform -> set of known external IDs

  constructor(repository: JobRepository) {
    this.repository = repository;
    this.cache = new Map();
  }

  /**
   * Filter out jobs that already exist in the database.
   * Returns only new jobs that should be inserted.
   */
  async filterNew<T extends { externalId: string }>(
    platform: string,
    jobs: T[]
  ): Promise<{ newJobs: T[]; skippedCount: number }> {
    if (jobs.length === 0) return { newJobs: [], skippedCount: 0 };

    const externalIds = jobs.map(j => j.externalId);

    // Check local cache first
    let knownIds = this.cache.get(platform);
    if (!knownIds) {
      knownIds = new Set();
      this.cache.set(platform, knownIds);
    }

    // IDs not in local cache → check DB
    const uncachedIds = externalIds.filter(id => !knownIds!.has(id));
    if (uncachedIds.length > 0) {
      const existingInDb = await this.repository.getExistingExternalIds(platform, uncachedIds);
      existingInDb.forEach(id => knownIds!.add(id));
    }

    const newJobs = jobs.filter(j => !knownIds!.has(j.externalId));
    const skippedCount = jobs.length - newJobs.length;

    if (skippedCount > 0) {
      logger.info(`Duplicate check: ${skippedCount} already exist, ${newJobs.length} are new`);
    }

    return { newJobs, skippedCount };
  }

  /**
   * Mark IDs as known after successful insert.
   */
  markAsKnown(platform: string, externalIds: string[]): void {
    let knownIds = this.cache.get(platform);
    if (!knownIds) {
      knownIds = new Set();
      this.cache.set(platform, knownIds);
    }
    externalIds.forEach(id => knownIds!.add(id));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
