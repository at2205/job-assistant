/**
 * LinkedIn Auto-Poster with AI-generated virtual image.
 *
 * What it does:
 *   1. Generates an engaging LinkedIn post (text) using your ChatGPT / OpenAI API.
 *   2. Generates a "virtual" showcase image using OpenAI's image API (gpt-image-1 / DALL·E).
 *   3. Opens LinkedIn with your saved persistent session, attaches the image, and publishes.
 *
 * Goal: increase the reach of your LinkedIn profile with consistent, visual posts.
 *
 * Usage:
 *   node linkedin-auto-post.cjs                          # auto-picks a relevant AI/skills topic
 *   node linkedin-auto-post.cjs "Your custom topic"      # one-off topic
 *   POST_DRY_RUN=true node linkedin-auto-post.cjs        # generate + preview, do NOT publish
 *
 * Required env (.env):
 *   OPENAI_API_KEY        Your OpenAI / ChatGPT API key
 *   OPENAI_MODEL          Chat model (e.g. gpt-5.3). Default: gpt-4o-mini
 *   OPENAI_IMAGE_MODEL    Image model. Default: gpt-image-1
 * Optional env:
 *   POST_TOPIC            Fixed topic/theme for every post (pins the topic)
 *   POST_TOPICS           Your own topic bank, semicolon-separated. The script auto-rotates
 *                         through these (avoiding recent repeats). Falls back to a built-in
 *                         bank of AI + your-skills/tools topics when unset.
 *   POST_PERSONA          Who is posting (e.g. "a Java backend developer")
 *   POST_IMAGE_SIZE       1024x1024 | 1024x1536 | 1536x1024 (default 1024x1024)
 *   GROQ_API_KEY          Fallback text generator if OpenAI text call fails
 *   HEADLESS              true/false (default false so you can watch / solve checkpoints)
 *   POST_DRY_RUN          true => generate content but do not publish
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// ----------------------------------------------------------------------------
// Setup & helpers
// ----------------------------------------------------------------------------
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'post');
const GENERATED_DIR = path.resolve(__dirname, 'generated');
for (const d of [SCREENSHOTS_DIR, GENERATED_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

let snapN = 0;
async function snap(page, label) {
  snapN++;
  const f = `post-${snapN}-${label}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }).catch(() => {});
  console.log(`  [SNAP] ${f}`);
}

// Use a dedicated flag so the auto-apply DRY_RUN in .env doesn't block posting.
// Enable a no-publish preview with: POST_DRY_RUN=true  (or pass it on the CLI)
const DRY_RUN = String(process.env.POST_DRY_RUN || '').toLowerCase() === 'true';
const HEADLESS = String(process.env.HEADLESS || 'false').toLowerCase() === 'true';

// Click an element by its visible text (robust against LinkedIn class churn).
async function clickByText(page, texts, tag = '*') {
  const list = Array.isArray(texts) ? texts : [texts];
  const pos = await page.evaluate(
    ({ list, tag }) => {
      for (const el of document.querySelectorAll(tag)) {
        const t = (el.textContent || '').trim();
        const aria = el.getAttribute && (el.getAttribute('aria-label') || '');
        for (const want of list) {
          if (t === want || aria === want || t.includes(want) || (aria && aria.includes(want))) {
            const r = el.getBoundingClientRect();
            if (r.width > 5 && r.height > 5 && r.y >= 0) {
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        }
      }
      return null;
    },
    { list, tag }
  );
  if (pos) {
    await page.mouse.click(pos.x, pos.y);
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// AI: generate the post text (ChatGPT / OpenAI, with Groq fallback)
// ----------------------------------------------------------------------------
async function openAIChat(prompt, systemPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  // GPT-5-era models use `max_completion_tokens`; older ones use `max_tokens`.
  const baseBody = { model, messages };
  const attempts = [
    { ...baseBody, max_completion_tokens: 600 },
    { ...baseBody, max_tokens: 600, temperature: 0.8 },
  ];

  let lastErr = '';
  for (const body of attempts) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (text) return text;
      lastErr = 'empty response';
      continue;
    }
    lastErr = `${res.status}: ${await res.text()}`;
    // If it's a param mismatch, try the next attempt shape; otherwise stop.
    if (!/max_tokens|max_completion_tokens|temperature|unsupported/i.test(lastErr)) break;
  }
  throw new Error(`OpenAI chat failed (${lastErr})`);
}

async function groqChat(prompt, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 600 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Groq chat failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function generatePostText(topic) {
  const persona = process.env.POST_PERSONA || 'a software engineer building real-world projects';
  const system =
    'You are a LinkedIn growth copywriter. Write posts that are authentic, specific, and ' +
    'designed to maximize reach (a strong hook, short scannable lines, a takeaway, and a question ' +
    'to drive comments). No markdown, no asterisks, no headings. Plain text only.';
  const prompt =
    `Write a LinkedIn post as ${persona}.\n` +
    `Topic/theme: ${topic}\n\n` +
    `Requirements:\n` +
    `- Start with a scroll-stopping first line (the hook).\n` +
    `- 120-200 words, short lines, easy to skim.\n` +
    `- Sound human and credible, not salesy or AI-ish.\n` +
    `- End with one open question to invite comments.\n` +
    `- Add 4-6 relevant hashtags on the last line.\n` +
    `Return ONLY the post text.`;

  try {
    console.log('  [AI] generating post text via OpenAI...');
    return await openAIChat(prompt, system);
  } catch (e) {
    console.log(`  [AI] OpenAI text failed: ${e.message}`);
    if (process.env.GROQ_API_KEY) {
      console.log('  [AI] falling back to Groq...');
      return await groqChat(prompt, system);
    }
    throw e;
  }
}

// ----------------------------------------------------------------------------
// AI: generate the virtual showcase image (OpenAI Images API)
// ----------------------------------------------------------------------------
async function generateImage(topic) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('  [IMG] OPENAI_API_KEY not set — skipping image, will post text only.');
    return null;
  }
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const size = process.env.POST_IMAGE_SIZE || '1024x1024';

  const imagePrompt =
    `A clean, modern, professional illustration for a LinkedIn post about: ${topic}. ` +
    `Flat vector tech aesthetic, vibrant but corporate-friendly colors, subtle gradient background, ` +
    `clear focal subject, no text, no watermark, no logos. High quality, social-media ready.`;

  const body = { model, prompt: imagePrompt, size, n: 1 };
  // dall-e models support response_format; gpt-image-1 returns b64 by default and rejects the param.
  if (/dall-e/i.test(model)) body.response_format = 'b64_json';

  console.log(`  [IMG] generating virtual image via ${model} (${size})...`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    console.log(`  [IMG] image generation failed (${res.status}): ${await res.text()}`);
    console.log('  [IMG] continuing without an image.');
    return null;
  }
  const data = await res.json();
  const item = data.data?.[0] || {};
  const outPath = path.join(GENERATED_DIR, `post-image-${Date.now()}.png`);

  if (item.b64_json) {
    fs.writeFileSync(outPath, Buffer.from(item.b64_json, 'base64'));
  } else if (item.url) {
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(outPath, buf);
  } else {
    console.log('  [IMG] no image data returned; continuing without an image.');
    return null;
  }
  console.log(`  [IMG] saved -> ${outPath}`);
  return outPath;
}

// ----------------------------------------------------------------------------
// LinkedIn: publish the post
// ----------------------------------------------------------------------------
async function publishToLinkedIn(postText, imagePath) {
  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    slowMo: 30,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  try {
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    if (page.url().includes('/login') || page.url().includes('/authwall') || page.url().includes('checkpoint')) {
      console.log('  Not logged in. Run the login script first:');
      console.log('    npx ts-node src/linkedin-login.ts');
      await snap(page, 'not-logged-in');
      await context.close();
      return false;
    }
    console.log('  OK!');

    // Open the post composer.
    console.log('[COMPOSE]');
    let opened = await clickByText(page, ['Start a post', 'Create a post'], 'button');
    if (!opened) opened = await clickByText(page, ['Start a post', 'Create a post']);
    await sleep(rand(2500, 4000));
    await snap(page, 'composer-open');

    // Type into the Quill editor (contenteditable).
    const editor = page.locator('.ql-editor, div[role="textbox"][contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();
    await page.keyboard.type(postText, { delay: 8 });
    await sleep(1500);
    await snap(page, 'text-typed');

    // Attach the AI image.
    if (imagePath) {
      console.log('[IMAGE] attaching virtual image...');
      try {
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
        const clicked =
          (await clickByText(page, ['Add a photo', 'Add media', 'Photo'])) ||
          (await page.locator('[aria-label*="photo" i], [aria-label*="media" i]').first().click().then(() => true).catch(() => false));
        if (!clicked) console.log('  Could not find the photo button via text; trying file input directly.');
        const chooser = await fileChooserPromise.catch(() => null);
        if (chooser) {
          await chooser.setFiles(imagePath);
        } else {
          // Fallback: set the hidden file input directly.
          await page.setInputFiles('input[type="file"]', imagePath).catch((e) =>
            console.log('  File input fallback failed: ' + e.message)
          );
        }
        await sleep(rand(3000, 5000));
        await snap(page, 'image-selected');

        // Confirm the media editor (Next / Done).
        await clickByText(page, ['Next', 'Done'], 'button');
        await sleep(2000);
        await snap(page, 'image-confirmed');
      } catch (e) {
        console.log('  [IMAGE] attach failed, posting text only: ' + e.message);
      }
    }

    if (DRY_RUN) {
      console.log('\n[DRY_RUN] Not publishing. Review the composed post in the browser.');
      await snap(page, 'dry-run-final');
      console.log('  Browser stays open 60s for review...');
      await sleep(60000);
      await context.close();
      return true;
    }

    // Publish.
    console.log('[PUBLISH]');
    let posted = await clickByText(page, ['Post'], 'button');
    if (!posted) {
      // The Post button sometimes needs an exact aria-label.
      posted = await page
        .locator('button.share-actions__primary-action, button[aria-label="Post"]')
        .first()
        .click()
        .then(() => true)
        .catch(() => false);
    }
    await sleep(rand(4000, 6000));
    await snap(page, 'after-post');

    console.log(posted ? '  ✅ Post published!' : '  ⚠️ Could not confirm publish — check screenshots.');
    await sleep(4000);
    await context.close();
    return posted;
  } catch (err) {
    console.error('[FATAL] ' + err.message);
    await snap(page, 'fatal');
    await context.close();
    return false;
  }
}

// ----------------------------------------------------------------------------
// Topic bank: relevant themes about AI + your job-profile skills & tools.
// The script auto-rotates through these (avoiding recent repeats) so you can
// share consistent, on-brand content without picking a topic every time.
// Override the whole list with POST_TOPICS in .env (semicolon-separated),
// or pass a one-off topic on the CLI.
// ----------------------------------------------------------------------------
const DEFAULT_TOPICS = [
  // --- AI / GenAI ---
  'how AI agents and LLMs are changing the way developers build software',
  'practical lessons from integrating LLM APIs (OpenAI, Groq) into a real product',
  'prompt engineering tips that actually improved my AI output quality',
  'building reliable AI features with provider fallbacks and retries',
  'RAG vs fine-tuning: what I learned choosing the right approach',
  'how I use AI to automate repetitive engineering tasks',
  'the difference between an AI demo and a production-ready AI system',
  // --- Java / Spring Boot (core profile) ---
  'why Spring Boot is still my go-to for building robust backend APIs',
  'designing clean REST APIs in Spring Boot that scale',
  'lessons on JVM performance tuning and memory optimization',
  'how I structure a Spring Boot project for maintainability',
  'database design and JPA pitfalls every Java developer should know',
  // --- Tools / stack ---
  'browser automation with Playwright: what worked and what broke',
  'building a full-stack app with Spring Boot, Next.js and PostgreSQL',
  'Dockerizing a multi-service app for clean, reproducible deployments',
  'how I set up CI/CD and monitoring for a side project',
  // --- Project / career ---
  'lessons learned building an AI-powered job-hunting automation platform',
  'what building real projects taught me that tutorials never did',
  'how I approach learning a new tool or framework quickly',
];

function loadTopics() {
  const env = (process.env.POST_TOPICS || '').trim();
  if (env) {
    const list = env.split(';').map((t) => t.trim()).filter(Boolean);
    if (list.length) return list;
  }
  return DEFAULT_TOPICS;
}

const HISTORY_PATH = path.join(GENERATED_DIR, 'post-history.json');

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return { recentTopics: [] };
  }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.log('  [WARN] could not save post history: ' + e.message);
  }
}

// Pick a topic that hasn't been used recently, so posts stay varied.
function pickTopic() {
  const topics = loadTopics();
  const history = readHistory();
  const recent = history.recentTopics || [];
  const fresh = topics.filter((t) => !recent.includes(t));
  const pool = fresh.length ? fresh : topics; // all used? reset pool
  const choice = pool[Math.floor(Math.random() * pool.length)];

  // Keep a rolling window of the last ~half of the bank as "recent".
  const windowSize = Math.max(1, Math.floor(topics.length / 2));
  history.recentTopics = [choice, ...recent.filter((t) => t !== choice)].slice(0, windowSize);
  saveHistory(history);
  return choice;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  console.log('=== LinkedIn Auto-Poster (AI text + virtual image) ===\n');

  const cliTopic = process.argv.slice(2).join(' ').trim();
  let topic;
  if (cliTopic) {
    topic = cliTopic; // explicit one-off topic
  } else if ((process.env.POST_TOPIC || '').trim()) {
    topic = process.env.POST_TOPIC.trim(); // fixed topic from .env
  } else {
    topic = pickTopic(); // auto-rotate relevant AI / profile topic
    console.log('(auto-selected a relevant topic — set POST_TOPIC to pin one, or POST_TOPICS for your own list)');
  }

  console.log(`Topic: ${topic}\n`);

  console.log('[1/3] Generating post text...');
  const postText = await generatePostText(topic);
  console.log('\n--- POST PREVIEW ---\n' + postText + '\n--------------------\n');

  console.log('[2/3] Generating virtual image...');
  const imagePath = await generateImage(topic);

  // Save the generated text alongside the image for your records.
  const textOut = path.join(GENERATED_DIR, `post-text-${Date.now()}.txt`);
  fs.writeFileSync(textOut, postText, 'utf8');
  console.log(`  [TEXT] saved -> ${textOut}\n`);

  console.log('[3/3] Publishing to LinkedIn...');
  const ok = await publishToLinkedIn(postText, imagePath);
  console.log(`\nDone. ${ok ? 'Success.' : 'Finished with warnings — review screenshots/post/.'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
