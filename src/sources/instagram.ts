// Instagram ingestion source — real endpoints wired in phase 5, after
// confirming the live Meta docs. Stubbed for now so the source selector type-
// checks and SOURCE=instagram fails with a clear message instead of a crash.
import type { Message } from '../types.js';

export async function fetchRecent(_since: Date): Promise<Message[]> {
  throw new Error(
    'Instagram source is not implemented yet (phase 5). Set SOURCE=demo to run.',
  );
}
