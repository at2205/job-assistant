import { AIClient, createAIClient } from './ai-client';
import { PromptBuilder, PromptContext, ResumeVariant } from './prompt-builder';
import { ContentRepository, ContentType } from '../db/content-repository';
import { GenerationResult } from './types';
import logger from '../utils/logger';

/**
 * Post-processing: validate and clean AI output.
 */
function postProcess(text: string, type: ContentType): { cleaned: string; qualityScore: number } {
  let cleaned = text.trim();
  let qualityScore = 80; // baseline

  // Remove common AI preamble noise
  const noisePatterns = [
    /^(Here(?:'s| is| are)[^:]*:\s*)/i,
    /^(Sure[,!]?\s*)/i,
    /^(Of course[,!]?\s*)/i,
    /^(Certainly[,!]?\s*)/i,
    /^(Based on (?:the|your)[^,]*,\s*)/i,
  ];
  for (const pat of noisePatterns) {
    if (pat.test(cleaned)) {
      cleaned = cleaned.replace(pat, '');
      qualityScore -= 5; // penalize for needing cleanup
    }
  }

  // Type-specific validation
  if (type === 'resume') {
    const bullets = cleaned.split('\n').filter(l => l.trim().length > 10);
    if (bullets.length < 3) {
      qualityScore -= 20; // too few bullets
      logger.warn('Resume output has fewer than 3 bullets');
    }
    if (bullets.length > 10) {
      // Trim to top 6
      cleaned = bullets.slice(0, 6).join('\n');
    }
    // Check for action verbs
    const actionVerbPattern = /^[•\-\*]?\s*(Developed|Built|Designed|Architected|Implemented|Optimized|Led|Delivered|Created|Managed|Reduced|Improved|Integrated|Automated|Migrated)/i;
    const withVerbs = bullets.filter(b => actionVerbPattern.test(b));
    if (withVerbs.length < bullets.length * 0.5) {
      qualityScore -= 10; // too few action verbs
    }
  }

  if (type === 'cover_letter') {
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount < 80) {
      qualityScore -= 15;
      logger.warn(`Cover letter too short: ${wordCount} words`);
    }
    if (wordCount > 400) {
      qualityScore -= 10;
      logger.warn(`Cover letter too long: ${wordCount} words`);
    }
  }

  if (type === 'answers') {
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount < 30) qualityScore -= 20;
    if (wordCount > 300) qualityScore -= 10;
  }

  // Generic checks
  if (cleaned.toLowerCase().includes('as an ai')) {
    qualityScore -= 30; // AI leaked through
    cleaned = cleaned.replace(/as an ai[^.]*\./gi, '');
    logger.warn('AI self-reference detected and removed');
  }

  return { cleaned: cleaned.trim(), qualityScore: Math.max(0, Math.min(100, qualityScore)) };
}

/**
 * Base generator logic shared by all content types.
 */
async function generateAndStore(params: {
  aiClient: AIClient;
  contentRepo: ContentRepository;
  userId: string;
  jobId: string;
  contentType: ContentType;
  systemPrompt: string;
  prompt: string;
  forceRegenerate: boolean;
}): Promise<{ content: string; cached: boolean; provider: string; model: string; qualityScore: number }> {
  const { aiClient, contentRepo, userId, jobId, contentType, systemPrompt, prompt, forceRegenerate } = params;

  // Check cache
  if (!forceRegenerate) {
    const cached = await contentRepo.getCached(userId, jobId, contentType);
    if (cached) {
      logger.info(`Using cached ${contentType} for job ${jobId}`);
      return {
        content: cached.content,
        cached: true,
        provider: cached.providerUsed,
        model: cached.modelUsed,
        qualityScore: cached.qualityScore ?? 0,
      };
    }
  }

  // Generate
  const result: GenerationResult = await aiClient.generate(prompt, {
    systemPrompt,
    temperature: 0.7,
    maxTokens: contentType === 'cover_letter' ? 800 : 600,
  });

  // Post-process
  const { cleaned, qualityScore } = postProcess(result.text, contentType);

  // Store
  await contentRepo.save({
    userId,
    jobId,
    contentType,
    content: cleaned,
    promptUsed: prompt,
    provider: result.provider,
    model: result.model,
    generationTimeMs: result.latencyMs,
    qualityScore,
  });

  return {
    content: cleaned,
    cached: false,
    provider: result.provider,
    model: result.model,
    qualityScore,
  };
}

// ============================================
// RESUME GENERATOR
// ============================================

export class ResumeGenerator {
  private aiClient: AIClient;
  private promptBuilder = new PromptBuilder();
  private contentRepo = new ContentRepository();

  constructor(aiClient?: AIClient) {
    this.aiClient = aiClient || createAIClient();
  }

  async generate(
    ctx: PromptContext,
    userId: string,
    options: { forceRegenerate?: boolean; variant?: ResumeVariant } = {}
  ): Promise<{ content: string; cached: boolean; provider: string; qualityScore: number }> {
    const variant = options.variant || 'ats';
    logger.info(`Generating ${variant} resume for: ${ctx.job.title} @ ${ctx.job.companyName}`);
    const { system, prompt } = this.promptBuilder.buildResumePrompt(ctx, variant);

    const result = await generateAndStore({
      aiClient: this.aiClient,
      contentRepo: this.contentRepo,
      userId,
      jobId: ctx.job.jobId,
      contentType: 'resume',
      systemPrompt: system,
      prompt,
      forceRegenerate: options.forceRegenerate || false,
    });

    return { content: result.content, cached: result.cached, provider: result.provider, qualityScore: result.qualityScore };
  }
}

// ============================================
// COVER LETTER GENERATOR
// ============================================

export class CoverLetterGenerator {
  private aiClient: AIClient;
  private promptBuilder = new PromptBuilder();
  private contentRepo = new ContentRepository();

  constructor(aiClient?: AIClient) {
    this.aiClient = aiClient || createAIClient();
  }

  async generate(
    ctx: PromptContext,
    userId: string,
    options: { forceRegenerate?: boolean } = {}
  ): Promise<{ content: string; cached: boolean; provider: string; qualityScore: number }> {
    logger.info(`Generating cover letter for job: ${ctx.job.title} @ ${ctx.job.companyName}`);
    const { system, prompt } = this.promptBuilder.buildCoverLetterPrompt(ctx);

    const result = await generateAndStore({
      aiClient: this.aiClient,
      contentRepo: this.contentRepo,
      userId,
      jobId: ctx.job.jobId,
      contentType: 'cover_letter',
      systemPrompt: system,
      prompt,
      forceRegenerate: options.forceRegenerate || false,
    });

    return { content: result.content, cached: result.cached, provider: result.provider, qualityScore: result.qualityScore };
  }
}

// ============================================
// ANSWER GENERATOR
// ============================================

export class AnswerGenerator {
  private aiClient: AIClient;
  private promptBuilder = new PromptBuilder();
  private contentRepo = new ContentRepository();

  constructor(aiClient?: AIClient) {
    this.aiClient = aiClient || createAIClient();
  }

  async generate(
    ctx: PromptContext,
    userId: string,
    question: string,
    options: { forceRegenerate?: boolean } = {}
  ): Promise<{ content: string; cached: boolean; provider: string; qualityScore: number }> {
    logger.info(`Generating answer for: "${question.slice(0, 60)}..."`);
    const { system, prompt } = this.promptBuilder.buildAnswerPrompt(ctx, question);

    const result = await generateAndStore({
      aiClient: this.aiClient,
      contentRepo: this.contentRepo,
      userId,
      jobId: ctx.job.jobId,
      contentType: 'answers',
      systemPrompt: system,
      prompt,
      forceRegenerate: options.forceRegenerate || false,
    });

    return { content: result.content, cached: result.cached, provider: result.provider, qualityScore: result.qualityScore };
  }
}
