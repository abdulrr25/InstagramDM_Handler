// The classifier. Calls Groq's OpenAI-compatible endpoint with a plain fetch
// (no SDK, no provider abstraction — swapping providers is a base-URL change).
// Output is validated with zod; a parse failure retries once, then stores the
// verdict as "unknown", which the UI always shows.
import { z } from 'zod';
import {
  config,
  hasClassifier,
  routes,
  routeIds,
  routeById,
  UNKNOWN_ROUTE,
} from './config.js';
import {
  getLabeledExamples,
  getUnclassifiedMessages,
  insertClassification,
} from './queries.js';
import type { MessageRow, Sender } from './types.js';

/** Validated shape of one classification. Route must be a configured route. */
const OutputSchema = z.object({
  route: z.string().refine((r) => routeIds.includes(r), 'route not in config'),
  confidence: z.coerce.number(),
  reason: z.string().min(1),
});

export interface Verdict {
  route: string;
  confidence: number;
  reason: string;
  model: string;
}

/** Human-readable sender block — metadata is often a stronger signal than text. */
function formatSender(s: Sender): string {
  const yn = (b: boolean | undefined) => (b === undefined ? 'unknown' : b ? 'yes' : 'no');
  const lines = [
    `From: @${s.username}${s.name ? ` (${s.name})` : ''}`,
    s.bio ? `Bio: ${s.bio}` : `Bio: (none)`,
    `Followers: ${s.followers_count ?? 'unknown'} | ` +
      `Following: ${s.follows_count ?? 'unknown'} | ` +
      `Verified: ${yn(s.is_verified)} | ` +
      `Follows you: ${yn(s.follows_you)} | ` +
      `Business account: ${yn(s.is_business)}`,
  ];
  return lines.join('\n');
}

function formatMessageForPrompt(row: MessageRow): string {
  return `${formatSender(row.sender)}\nMessage: ${JSON.stringify(row.text)}`;
}

function systemPrompt(): string {
  const routeList = routes
    .map((r) => `- "${r.id}" (${r.label}): ${r.description}`)
    .join('\n');
  return (
    `You triage inbound Instagram DMs for a business owner. Assign each message ` +
    `to exactly one route.\n\n` +
    `About this business: ${config.businessContext}\n\n` +
    `Routes:\n${routeList}\n\n` +
    `The sender's metadata (follower/following counts, bio, verification, whether ` +
    `they follow the account) is often a stronger signal than the message text — ` +
    `weigh it heavily. A verified or high-follower account can still be spam; a ` +
    `tiny account can still be a real lead.\n\n` +
    `Respond with ONLY a JSON object, no prose, of exactly this shape:\n` +
    `{"route": <one of ${routeIds.map((r) => `"${r}"`).join(', ')}>, ` +
    `"confidence": <number 0..1>, "reason": <one short sentence>}`
  );
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Build the chat with up to 20 recent hand-labelled messages as few-shot. */
function buildMessages(row: MessageRow, examples: MessageRow[]): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: systemPrompt() }];
  // Never show the model the message it is about to classify — a message
  // labelled before it was scored is in both the queue and the examples, and
  // feeding its own label back would leak the answer. Oldest example first
  // reads more naturally as a demonstration sequence.
  const shots = examples.filter((e) => e.id !== row.id);
  for (const ex of [...shots].reverse()) {
    msgs.push({ role: 'user', content: formatMessageForPrompt(ex) });
    msgs.push({
      role: 'assistant',
      content: JSON.stringify({
        route: ex.human_route,
        confidence: 1,
        reason: 'Owner-confirmed label.',
      }),
    });
  }
  msgs.push({ role: 'user', content: formatMessageForPrompt(row) });
  return msgs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long to wait after a 429, from the Retry-After header or the message. */
function retryAfterMs(res: Response, body: string): number | null {
  const header = res.headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.ceil(secs * 1000);
  }
  // Groq embeds "try again in 1.155s" in the error message.
  const m = body.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(Number(m[1]) * 1000);
  return null;
}

/**
 * POST to the OpenAI-compatible endpoint. Transparently waits out rate limits
 * (429) using the server's Retry-After hint, up to a few attempts. Throws on
 * other transport/API errors.
 */
async function callGroq(messages: ChatMessage[]): Promise<string> {
  const MAX_RATE_LIMIT_RETRIES = 6;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0,
        // Ceiling, not a target — the JSON verdict is tiny. Kept generous so a
        // thinking-capable model (e.g. Claude) has room to reason before the
        // answer instead of truncating it. response_format is honored by
        // Groq/OpenAI and harmlessly ignored by Anthropic's compat endpoint.
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq API returned no content');
      return content;
    }

    const body = await res.text().catch(() => '');
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Wait the server-suggested time (plus a little), then retry the same call.
      const wait = (retryAfterMs(res, body) ?? Math.min(2000 * 2 ** attempt, 30_000)) + 250;
      await sleep(wait);
      continue;
    }
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Parse + validate model output. Returns null on any parse/validation failure. */
function parseVerdict(content: string): { route: string; confidence: number; reason: string } | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = OutputSchema.safeParse(json);
  if (!parsed.success) return null;
  // Clamp confidence into [0,1] — the model occasionally drifts outside.
  const confidence = Math.min(1, Math.max(0, parsed.data.confidence));
  return {
    route: parsed.data.route,
    confidence,
    reason: parsed.data.reason.trim().slice(0, 300),
  };
}

/**
 * Classify one message. Retries once on a parse failure; a second failure
 * yields an "unknown" verdict (never hidden, always shown). Transport/API
 * errors propagate so the caller can leave the message unclassified and retry
 * on the next poll rather than storing a wrong verdict.
 */
export async function classifyMessage(
  row: MessageRow,
  examples: MessageRow[],
): Promise<Verdict> {
  const messages = buildMessages(row, examples);
  const model = config.groq.model;

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await callGroq(messages);
    const verdict = parseVerdict(content);
    if (verdict) return { ...verdict, model };
  }

  // Both attempts failed to parse/validate.
  return {
    route: UNKNOWN_ROUTE,
    confidence: 0,
    reason: 'Model output failed validation twice.',
    model,
  };
}

// --- Offline demo classifier -------------------------------------------------
// Used ONLY when no GROQ_API_KEY is set, so the whole app — classified board and
// eval — works with zero credentials (constraint: usable before any API access).
// It is a transparent keyword+metadata heuristic, stored with model
// "demo-heuristic" so it is never mistaken for the LLM. Deliberately biased away
// from routing genuine messages to noise: a hidden lead is the expensive error.

const NOISE_HINTS = [
  'crypto', 'airdrop', 'btc', 'bitcoin', 'nft', 'web3', 'wagmi', 'token', 'mint',
  'followers', 'f4f', 'l4l', 'engagement group', 'smm', 'likes at cheap',
  'seo', 'rank #1', "google's first page", 'giveaway', 'you won', 'iphone',
  'claim', 'verify your identity', 'suspended', 'unusual login', 'whatsapp',
  'wechat', 'factory direct', 'oem', 'wholesale', 'cover the shipping',
  'cover shipping', 'get rich', 'dropship', 'winning product', 'media kit',
  'exposure to our', 'deposit', 'nda and a deposit',
];
const SUPPORT_HINTS = [
  'export', 'render', 'timeout', 'crash', 'autosave', 'recover', 'billing',
  'refund', 'invoice', 'charged', 'subscriber', 'subscription', 'upgrade',
  'plan', 'student discount', 'batch-export', 'preset', 'api', 'docs',
  'settings', 'annual plan', 'team plan',
];
const LEAD_HINTS = [
  'budget', 'need a', 'need someone', 'launch film', 'launch video', 'hero video',
  'explainer', 'campaign', 'shoot', 'walkthrough', 'reels every', 'music video',
  'product film', 'ready to sign', 'retainer', 'per month', 'project',
];

function countHits(haystack: string, hints: string[]): number {
  return hints.reduce((n, h) => (haystack.includes(h) ? n + 1 : n), 0);
}

export function demoClassify(row: MessageRow): Verdict {
  const hay = `${row.text} ${row.sender.bio ?? ''}`.toLowerCase();
  const s = row.sender;
  const model = 'demo-heuristic';

  let noise = countHits(hay, NOISE_HINTS);
  const support = countHits(hay, SUPPORT_HINTS);
  const lead = countHits(hay, LEAD_HINTS);

  // Metadata smell: follows many, followed by few — classic outreach account.
  if (
    s.followers_count !== undefined &&
    s.follows_count !== undefined &&
    s.follows_count > s.followers_count * 1.5 &&
    s.follows_count > 1000
  ) {
    noise += 1;
  }
  // An existing user (follows the account) leans support/real over noise.
  const isFollower = s.follows_you === true;

  if (noise >= 1 && noise >= support && noise >= lead && !isFollower) {
    return { route: 'noise', confidence: 0.9, reason: 'Mass-outreach / spam signals in text and metadata.', model };
  }
  if (support >= 1 && support >= lead) {
    return { route: 'support', confidence: 0.8, reason: 'Existing user with a product or billing question.', model };
  }
  if (lead >= 1) {
    return { route: 'lead', confidence: 0.85, reason: 'Names a concrete need, budget, or timeline.', model };
  }
  return { route: 'maybe', confidence: 0.5, reason: 'Vague interest with no specifics.', model };
}

export interface ClassifyResult {
  mode: 'groq' | 'demo';
  classified: number;
  errors: number;
}

/**
 * Classify every message that has never been scored. Uses Groq when a key is
 * set, otherwise the offline heuristic — so the app is fully usable with zero
 * credentials.
 */
export async function classifyPending(): Promise<ClassifyResult> {
  const useGroq = hasClassifier();
  const pending = getUnclassifiedMessages();
  if (pending.length === 0) {
    return { mode: useGroq ? 'groq' : 'demo', classified: 0, errors: 0 };
  }

  const examples = getLabeledExamples(20);
  let classified = 0;
  let errors = 0;
  let consecutiveErrors = 0;

  for (const row of pending) {
    if (!useGroq) {
      insertClassification(row.id, demoClassify(row));
      classified++;
      continue;
    }
    try {
      const verdict = await classifyMessage(row, examples);
      insertClassification(row.id, verdict);
      classified++;
      consecutiveErrors = 0;
    } catch (err) {
      // Rate limits are already handled inside callGroq, so a throw here is a
      // real error. Skip this message (it stays unclassified and retries next
      // cycle) rather than abandoning the whole batch — but bail if the API is
      // clearly down, to avoid hammering it.
      console.error(`[classify] ${row.external_id}:`, (err as Error).message);
      errors++;
      if (++consecutiveErrors >= 5) {
        console.error('[classify] too many consecutive errors, stopping this round');
        break;
      }
    }
  }

  return { mode: useGroq ? 'groq' : 'demo', classified, errors };
}

// Re-exported for callers that want to describe a route in logs.
export { routeById };
