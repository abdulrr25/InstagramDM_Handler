// Demo ingestion source. Reads fixtures/demo.json and returns them as
// Messages, timestamped relative to *now* so they always look fresh. Honors
// `since` so it behaves like a real poll (seed passes epoch 0 to get them all).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Message, Sender } from '../types.js';

interface Fixture {
  external_id: string;
  thread_id: string;
  minutes_ago: number;
  text: string;
  sender: Sender;
}

function loadFixtures(): Fixture[] {
  const path = resolve(process.cwd(), 'fixtures/demo.json');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('fixtures/demo.json must be a JSON array');
  }
  return parsed as Fixture[];
}

export async function fetchRecent(since: Date): Promise<Message[]> {
  const now = Date.now();
  return loadFixtures()
    .map((f): Message => {
      const received_at = new Date(now - f.minutes_ago * 60_000);
      return {
        external_id: f.external_id,
        thread_id: f.thread_id,
        sender: f.sender,
        text: f.text,
        received_at,
        // The raw payload mirrors what a real source would hand us.
        raw: f,
      };
    })
    .filter((m) => m.received_at >= since)
    .sort((a, b) => b.received_at.getTime() - a.received_at.getTime());
}
