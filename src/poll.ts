// One poll cycle: fetch from the configured source, insert new messages,
// dedupe on external_id. Classification is wired in here in phase 3.
import { config } from './config.js';
import { getLatestReceivedAt, insertMessages } from './db.js';
import { getSource } from './sources/index.js';

/** Overlap window so a message landing between polls is never missed. */
const OVERLAP_MS = 5 * 60_000;

export async function runPoll(): Promise<{ fetched: number; inserted: number }> {
  const fetchRecent = await getSource();

  const latest = getLatestReceivedAt();
  const since = latest ? new Date(latest.getTime() - OVERLAP_MS) : new Date(0);

  const messages = await fetchRecent(since);
  const inserted = insertMessages(messages);

  return { fetched: messages.length, inserted };
}

export { config };
