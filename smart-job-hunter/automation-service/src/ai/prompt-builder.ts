import { UserFeatures, JobFeatures, ScoreResult } from '../matching/scoring-strategy';
import { ATSAnalysis } from '../optimization/ats-engine';

/**
 * Prompt templates — ATS-optimized for maximum interview conversion.
 * Every prompt is structured with: context, instruction, constraints, format.
 */

const SYSTEM_PROMPT = `You are an elite career strategist who has placed 500+ candidates at top tech companies.
You write content that passes ATS scanners AND impresses human recruiters.
Rules:
- Use exact keywords from the job description (ATS systems match literally)
- Use strong action verbs (Architected, Spearheaded, Optimized, Delivered, Scaled)
- Every bullet MUST have a quantifiable metric (%, scale, time, users, uptime)
- Never fabricate — rephrase and amplify real experience
- Be specific and concise — recruiters spend 6 seconds per resume
- No fluff: "results-driven" "team player" "hard-working" are banned
- Match the job's technical vocabulary exactly`;

export interface PromptContext {
  user: UserFeatures & { name?: string; currentRole?: string; summary?: string };
  job: JobFeatures;
  score?: ScoreResult;
  ats?: ATSAnalysis;
}

export type ResumeVariant = 'ats' | 'startup' | 'enterprise' | 'backend' | 'fullstack';

const VARIANT_INSTRUCTIONS: Record<ResumeVariant, string> = {
  ats: `STYLE: Maximum ATS keyword density. Use exact job posting terminology. Prioritize hard skills and tech stack mentions. Format for automated parsing.`,
  startup: `STYLE: Emphasize speed, ownership, and end-to-end delivery. Show scrappiness. Highlight shipping fast, wearing multiple hats, and impact at scale. Use startup language.`,
  enterprise: `STYLE: Emphasize scale, reliability, compliance, and process. Show experience with large systems, SLAs, and cross-team collaboration. Use enterprise vocabulary.`,
  backend: `STYLE: Focus on backend systems: APIs, databases, system design, performance, concurrency. Minimize frontend mentions. Emphasize architecture and scalability.`,
  fullstack: `STYLE: Balance frontend and backend equally. Show end-to-end ownership from UI to database. Emphasize modern full-stack tools and deployment.`,
};

export class PromptBuilder {

  buildResumePrompt(ctx: PromptContext, variant: ResumeVariant = 'ats'): { system: string; prompt: string } {
    const matchedSkills = ctx.ats?.matchedKeywords || ctx.score?.skillScore.matchedItems || [];
    const missingSkills = ctx.ats?.missingKeywords || [];
    const variantInstruction = VARIANT_INSTRUCTIONS[variant];

    const prompt = `TASK: Generate 6 tailored resume bullet points that will PASS ATS screening for this job.

TARGET JOB:
- Title: ${ctx.job.title}
- Company: ${ctx.job.companyName || 'Not specified'}
- Required Skills: ${ctx.job.skills.join(', ') || 'Not specified'}
- Experience Required: ${formatExpRange(ctx.job.experienceMin, ctx.job.experienceMax)}
- Location: ${ctx.job.location || 'Not specified'}

CANDIDATE PROFILE:
- Skills: ${ctx.user.skills.join(', ')}
- Experience: ${ctx.user.experienceYears} years
- Role: ${ctx.user.currentRole || 'Software Engineer'}
${ctx.user.summary ? `- Summary: ${ctx.user.summary}` : ''}

ATS OPTIMIZATION DATA:
- Keywords matched: ${matchedSkills.join(', ') || 'None identified'}
- Keywords MISSING (MUST include in bullets): ${missingSkills.slice(0, 8).join(', ') || 'All matched'}
- ATS score: ${ctx.ats?.atsScore ?? 'N/A'}/100
- Interview probability: ${ctx.ats?.interviewProbability ?? 'N/A'}%

${variantInstruction}

REQUIREMENTS:
1. EVERY bullet starts with a power verb (Architected, Spearheaded, Engineered, Delivered, Optimized)
2. EVERY bullet contains a number/metric (%, users, requests/sec, uptime, cost reduction)
3. Include at least 3 of these MISSING keywords naturally: ${missingSkills.slice(0, 5).join(', ')}
4. Use EXACT terminology from the job posting for ATS matching
5. Keep each bullet under 2 lines
6. Order: most relevant to job first

FORMAT: Return ONLY bullet points, one per line, prefixed with "•". No headers, no extra text.`;

    return { system: SYSTEM_PROMPT, prompt };
  }

  buildCoverLetterPrompt(ctx: PromptContext): { system: string; prompt: string } {
    const prompt = `TASK: Write a 150-200 word cover letter that gets opened by busy recruiters.

TARGET JOB:
- Title: ${ctx.job.title}
- Company: ${ctx.job.companyName || '[Company]'}
- Key Skills: ${ctx.job.skills.join(', ') || 'Not specified'}

CANDIDATE:
- Name: ${ctx.user.name || 'Aryan Tomar'}
- Skills: ${ctx.user.skills.slice(0, 8).join(', ')}
- Experience: ${ctx.user.experienceYears} years as ${ctx.user.currentRole || 'Software Engineer'}

INTERVIEW PROBABILITY: ${ctx.ats?.interviewProbability ?? ctx.score?.totalScore ?? 'N/A'}%

RULES — THE RECRUITER TEST:
1. First sentence: Name-drop the company + specific role. Show you researched them.
2. Paragraph 2 (3 sentences max): Connect YOUR top 2 achievements to THEIR requirements. Use numbers.
3. Paragraph 3 (2 sentences): What excites you about THIS company specifically. Not generic.
4. Closing: One confident sentence + call to action.

BANNED PHRASES (instant reject):
- "I am writing to express my interest"
- "I believe I would be a great fit"
- "Dear Hiring Manager"
- "With my X years of experience"
- "Passionate professional"
- Any sentence starting with "I am"

TONE: Confident peer, not desperate applicant. Like a warm intro from a mutual connection.

FORMAT: Return ONLY the letter body. No salutation, no sign-off. Paragraphs separated by blank lines.`;

    return { system: SYSTEM_PROMPT, prompt };
  }

  buildAnswerPrompt(ctx: PromptContext, question: string): { system: string; prompt: string } {
    const prompt = `TASK: Answer this application question in a way that makes the recruiter shortlist you.

QUESTION: "${question}"

JOB: ${ctx.job.title} at ${ctx.job.companyName || 'this company'}
YOUR SKILLS: ${ctx.user.skills.slice(0, 10).join(', ')}
YOUR EXP: ${ctx.user.experienceYears} years

RULES:
1. Lead with a specific achievement (not "I have X years...")
2. Connect your answer to what THIS role needs
3. Include one metric/number
4. 80-150 words max
5. End with forward-looking statement about this role

FORMAT: Return ONLY the answer. No preamble.`;

    return { system: SYSTEM_PROMPT, prompt };
  }

  buildCustomPrompt(ctx: PromptContext, instruction: string): { system: string; prompt: string } {
    const prompt = `${instruction}

JOB: ${ctx.job.title} at ${ctx.job.companyName || 'Not specified'}
SKILLS NEEDED: ${ctx.job.skills.join(', ')}
CANDIDATE SKILLS: ${ctx.user.skills.join(', ')}
EXPERIENCE: ${ctx.user.experienceYears} years`;

    return { system: SYSTEM_PROMPT, prompt };
  }
}

function formatExpRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Not specified';
  if (min !== null && max !== null) return `${min}-${max} years`;
  if (min !== null) return `${min}+ years`;
  return `Up to ${max} years`;
}
