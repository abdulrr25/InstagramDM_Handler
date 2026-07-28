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
  // Oldest example first reads more naturally as a demonstration sequence.
  for (const ex of [...examples].reverse()) {
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

/** POST to the OpenAI-compatible endpoint. Throws on transport/API errors. */
async function callGroq(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model: config.groq.model,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq API returned no content');
  return content;
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

export interface ClassifyResult {
  skipped: boolean;
  classified: number;
  errors: number;
}

/**
 * Classify every message that has never been scored. No-op (skipped) when no
 * classifier is configured, so the app runs fully in demo mode with zero creds.
 */
export async function classifyPending(): Promise<ClassifyResult> {
  if (!hasClassifier()) {
    return { skipped: true, classified: 0, errors: 0 };
  }

  const pending = getUnclassifiedMessages();
  if (pending.length === 0) return { skipped: false, classified: 0, errors: 0 };

  const examples = getLabeledExamples(20);
  let classified = 0;
  let errors = 0;

  for (const row of pending) {
    try {
      const verdict = await classifyMessage(row, examples);
      insertClassification(row.id, verdict);
      classified++;
    } catch (err) {
      // Transport/API error — leave unclassified, retry next cycle. One bad
      // call usually means the API is down, so stop hammering it this round.
      console.error(`[classify] ${row.external_id}:`, (err as Error).message);
      errors++;
      break;
    }
  }

  return { skipped: false, classified, errors };
}

// Re-exported for callers that want to describe a route in logs.
export { routeById };
