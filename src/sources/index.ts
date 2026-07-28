// Source selector. Two sources behind one signature — no plugin registry.
// Picks between them with the SOURCE env var; defaults to demo.
import { config } from '../config.js';
import type { Message } from '../types.js';

export type FetchRecent = (since: Date) => Promise<Message[]>;

export async function getSource(): Promise<FetchRecent> {
  if (config.source === 'instagram') {
    // Lazy import so demo mode never touches the Instagram code path.
    const mod = await import('./instagram.js');
    return mod.fetchRecent;
  }
  const mod = await import('./demo.js');
  return mod.fetchRecent;
}
