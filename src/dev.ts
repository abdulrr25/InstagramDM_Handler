// `npm run dev` — serve the review page on localhost and poll on a timer.
import { config, hasClassifier, validateConfig } from './config.js';
import { runPoll } from './poll.js';
import { startServer } from './server.js';

async function tick() {
  try {
    const { fetched, inserted, classified } = await runPoll();
    if (inserted > 0 || classified > 0) {
      console.log(`[poll] fetched=${fetched} inserted=${inserted} classified=${classified}`);
    }
  } catch (err) {
    console.error('[poll] failed:', err);
  }
}

async function main() {
  validateConfig();
  startServer();
  const classifier = hasClassifier()
    ? `classifier=${config.groq.model}`
    : 'classifier=off (set GROQ_API_KEY to enable)';
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
