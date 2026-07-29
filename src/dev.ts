// `npm run dev` — serve the review page on localhost and poll on a timer.
import { config, hasClassifier, validateConfig } from './config.js';
import { runPoll } from './poll.js';
import { startServer } from './server.js';

// Guard against overlapping ticks: a poll can outlast the interval (rate-limit
// backoff on a large backlog), and two concurrent runs would classify — and
// insert — the same messages twice. If one is still running, skip this tick.
let polling = false;

async function tick() {
  if (polling) return;
  polling = true;
  try {
    const { fetched, inserted, classified } = await runPoll();
    if (inserted > 0 || classified > 0) {
      console.log(`[poll] fetched=${fetched} inserted=${inserted} classified=${classified}`);
    }
  } catch (err) {
    console.error('[poll] failed:', err);
  } finally {
    polling = false;
  }
}

async function main() {
  validateConfig();
  startServer();
  const classifier = hasClassifier()
    ? `classifier=${config.groq.model}`
    : 'classifier=demo-heuristic (offline; set GROQ_API_KEY for the LLM)';
  console.log(
    `[dev] source=${config.source} ${classifier} polling every ${config.pollIntervalMs}ms`,
  );
  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
