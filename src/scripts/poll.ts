// `npm run poll` — one-shot fetch, for debugging. Prints what it pulled.
import { config, validateConfig } from '../config.js';
import { runPoll } from '../poll.js';

async function main() {
  validateConfig();
  const { fetched, inserted, classified, mode } = await runPoll();
  console.log(
    `[poll] source=${config.source} fetched=${fetched} inserted=${inserted} ` +
      `classified=${classified} (${mode})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
