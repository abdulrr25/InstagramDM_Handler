// `npm run dev` — serve the review page on localhost and poll on a timer.
import { config, validateConfig } from './config.js';
import { runPoll } from './poll.js';
import { startServer } from './server.js';

async function tick() {
  try {
    const { fetched, inserted } = await runPoll();
    if (inserted > 0) {
      console.log(`[poll] fetched=${fetched} inserted=${inserted}`);
    }
  } catch (err) {
    console.error('[poll] failed:', err);
  }
}

async function main() {
  validateConfig();
  startServer();
  console.log(
    `[dev] source=${config.source} polling every ${config.pollIntervalMs}ms`,
  );
  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
