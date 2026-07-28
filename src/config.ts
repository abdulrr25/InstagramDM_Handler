// Single source of truth for routes and runtime config.
// Nothing else in the app may hardcode a route id.
import { loadEnv } from './env.js';

loadEnv();

export interface Route {
  id: string;
  label: string;
  /** 'notify' shows in the default view; 'archive' is hidden past threshold. */
  action: 'notify' | 'archive';
  description: string;
}

export const routes: Route[] = [
  {
    id: 'lead',
    label: 'Real lead',
    action: 'notify',
    description: 'Names a specific need, brand, budget, or timeline.',
  },
  {
    id: 'support',
    label: 'Support',
    action: 'notify',
    description: 'Existing user with a problem or product question.',
  },
  {
    id: 'maybe',
    label: 'Maybe',
    action: 'notify',
    description:
      'Ambiguous. Vague interest, no specifics, could go either way.',
  },
  {
    id: 'noise',
    label: 'Noise',
    action: 'archive',
    description: 'Cold agency pitches, follower growth, crypto, mass outreach.',
  },
];

/**
 * Sentinel route for output that failed validation twice. Never hidden,
 * always shown — see the spec. Kept out of `routes` so it can never be an
 * `archive` action and never appears as a relabel button by accident... it is
 * a model failure state, not a human label.
 */
export const UNKNOWN_ROUTE = 'unknown';

export const routeIds = routes.map((r) => r.id);
export const notifyRouteIds = routes
  .filter((r) => r.action === 'notify')
  .map((r) => r.id);
export const archiveRouteIds = routes
  .filter((r) => r.action === 'archive')
  .map((r) => r.id);

export function routeById(id: string): Route | undefined {
  return routes.find((r) => r.id === id);
}

// --- Runtime config from env ------------------------------------------------

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Env ${name} must be a number, got: ${JSON.stringify(v)}`);
  }
  return n;
}

export const config = {
  source: (process.env.SOURCE ?? 'demo') as 'demo' | 'instagram',
  port: num('PORT', 8787),
  pollIntervalMs: num('POLL_INTERVAL_MS', 60_000),
  archiveThreshold: num('ARCHIVE_THRESHOLD', 1.1),
  dbPath: process.env.DB_PATH ?? './data/inbox.db',
  groq: {
    // OpenAI-compatible endpoint. Swapping providers is a base-URL change.
    apiKey: process.env.GROQ_API_KEY ?? '',
    baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  },
};

/** Whether a classifier is configured. Without a key the app stays in demo. */
export function hasClassifier(): boolean {
  return config.groq.apiKey.trim().length > 0;
}

/**
 * Validate invariants at startup and fail loudly. Called by every entrypoint.
 */
export function validateConfig(): void {
  const ids = new Set<string>();
  for (const r of routes) {
    if (ids.has(r.id)) throw new Error(`Duplicate route id: ${r.id}`);
    ids.add(r.id);
    if (r.action !== 'notify' && r.action !== 'archive') {
      throw new Error(`Route ${r.id} has invalid action: ${r.action}`);
    }
  }
  if (ids.has(UNKNOWN_ROUTE)) {
    throw new Error(`Route id "${UNKNOWN_ROUTE}" is reserved for model failures.`);
  }

  const archivers = routes.filter((r) => r.action === 'archive');
  if (archivers.length !== 1) {
    throw new Error(
      `Exactly one route must have action 'archive', found ${archivers.length}: ` +
        `[${archivers.map((r) => r.id).join(', ')}]`,
    );
  }

  if (config.source !== 'demo' && config.source !== 'instagram') {
    throw new Error(`SOURCE must be 'demo' or 'instagram', got: ${config.source}`);
  }
}
