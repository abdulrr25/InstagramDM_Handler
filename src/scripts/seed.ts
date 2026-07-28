// `npm run seed` — load the demo fixtures into the database.
// Always reads from the demo source regardless of SOURCE, so seeding works
// even when the app is configured to poll Instagram.
import { validateConfig } from '../config.js';
import { insertMessages } from '../db.js';
import { fetchRecent } from '../sources/demo.js';

async function main() {
  validateConfig();
  const messages = await fetchRecent(new Date(0));
  const inserted = insertMessages(messages);
  console.log(
    `Seeded ${inserted} new message(s) (${messages.length} in fixtures, ` +
      `${messages.length - inserted} already present).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
