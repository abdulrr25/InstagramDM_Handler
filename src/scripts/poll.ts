// `npm run poll` — one-shot fetch, for debugging. Prints what it pulled.
import { config, validateConfig } from '../config.js';
import { runPoll } from '../poll.js';

async function main() {
  validateConfig();
  const { fetched, inserted, classified, classifierSkipped } = await runPoll();
  const cls = classifierSkipped
    ? 'classifier=off (no GROQ_API_KEY)'
    : `classified=${classified}`;
  console.log(
    `[poll] source=${config.source} fetched=${fetched} inserted=${inserted} ${cls}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
