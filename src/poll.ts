// One poll cycle: fetch from the configured source, insert new messages
// (dedupe on external_id), then classify anything not yet scored.
import { config } from './config.js';
import { classifyPending } from './classify.js';
import { getLatestReceivedAt, insertMessages } from './db.js';
import { getSource } from './sources/index.js';

/** Overlap window so a message landing between polls is never missed. */
const OVERLAP_MS = 5 * 60_000;

export interface PollResult {
  fetched: number;
  inserted: number;
  classified: number;
  mode: 'groq' | 'demo';
}

export async function runPoll(): Promise<PollResult> {
  const fetchRecent = await getSource();

  const latest = getLatestReceivedAt();
  const since = latest ? new Date(latest.getTime() - OVERLAP_MS) : new Date(0);

  const messages = await fetchRecent(since);
  const inserted = insertMessages(messages);

  const cls = await classifyPending();

  return {
    fetched: messages.length,
    inserted,
    classified: cls.classified,
    mode: cls.mode,
  };
}

export { config };
