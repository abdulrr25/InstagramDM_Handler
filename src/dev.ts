// `npm run dev` — Phase 1: validate config and poll on a timer.
// Phase 2 adds the local server on top of this loop.
import { config, validateConfig } from './config.js';
import { runPoll } from './poll.js';

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
