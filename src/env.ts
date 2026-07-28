// Tiny, dependency-free .env loader. Reads ./.env once and sets any keys that
// are not already present in process.env (real env always wins). We hand-roll
// this instead of adding `dotenv` — it is a dozen lines and one fewer dep.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return; // no .env is fine — demo mode needs none
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    // strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
