// `npm run poll` — one-shot fetch, for debugging. Prints what it pulled.
import { config, validateConfig } from '../config.js';
import { runPoll } from '../poll.js';

async function main() {
  validateConfig();
  const { fetched, inserted } = await runPoll();
  console.log(
    `[poll] source=${config.source} fetched=${fetched} inserted=${inserted}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
