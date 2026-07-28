// `npm run eval` — accuracy report against the owner's hand labels.
// Reads every hand-labelled message that also has a model verdict and prints:
//   1. per-route precision + recall
//   2. a confusion matrix (rows = your label, cols = model)
//   3. the false-archive rate — the share of non-noise messages the model would
//      have hidden at the current threshold. This is the number that matters:
//      a message mislabelled but visible costs nothing; a real lead silently
//      hidden costs a client. Exits non-zero if it is above 1%.
import {
  archiveRouteIds,
  config,
  routes,
  routeIds,
  UNKNOWN_ROUTE,
  validateConfig,
} from '../config.js';
import { getAllRows } from '../queries.js';
import type { MessageRow } from '../types.js';

const ARCHIVE_ROUTE = archiveRouteIds[0]!;
const FALSE_ARCHIVE_LIMIT = 0.01; // 1%

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function ratioOrDash(num: number, den: number): string {
  return den === 0 ? '  —  ' : pct(num / den).padStart(5);
}
function pad(s: string | number, w: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(w) : str.padEnd(w);
}

function main(): void {
  validateConfig();
  const all = getAllRows();
  const labeled = all.filter((r) => r.human_route !== null);
  const evaluable = labeled.filter((r) => r.classification !== null);
  const excluded = labeled.length - evaluable.length;

  console.log('');
  console.log(
    `Eval — ${labeled.length} labelled, ${evaluable.length} scored by the model` +
      (excluded > 0 ? ` (${excluded} labelled but not yet classified, excluded)` : ''),
  );
  console.log(`Model(s): ${modelsUsed(evaluable)}`);

  if (evaluable.length === 0) {
    console.log('');
    console.log('Nothing to score yet. Label some messages at localhost:8787,');
    console.log('then run a poll so the classifier scores them (npm run poll).');
    console.log('');
    // No non-noise messages hidden, because there are none. Not a failure.
    reportFalseArchive([]);
    process.exit(0);
  }

  const predicted = (r: MessageRow) => r.classification!.route;
  const actual = (r: MessageRow) => r.human_route!;

  // --- 1. per-route precision / recall --------------------------------------
  console.log('');
  console.log('Per-route precision / recall');
  console.log(`  ${pad('route', 9)}${pad('prec', 7)}${pad('recall', 8)}support`);
  for (const r of routes) {
    const predPos = evaluable.filter((m) => predicted(m) === r.id).length;
    const actPos = evaluable.filter((m) => actual(m) === r.id).length;
    const tp = evaluable.filter((m) => predicted(m) === r.id && actual(m) === r.id).length;
    console.log(
      `  ${pad(r.id, 9)}${pad(ratioOrDash(tp, predPos), 7)}` +
        `${pad(ratioOrDash(tp, actPos), 8)}${actPos}`,
    );
  }
  const unknownPreds = evaluable.filter((m) => predicted(m) === UNKNOWN_ROUTE).length;
  if (unknownPreds > 0) {
    console.log(`  (${unknownPreds} scored "${UNKNOWN_ROUTE}" — model output failed validation)`);
  }

  // --- 2. confusion matrix ---------------------------------------------------
  const cols = [...routeIds, UNKNOWN_ROUTE];
  const colW = Math.max(7, ...cols.map((c) => c.length + 1));
  console.log('');
  console.log('Confusion matrix (rows = your label, cols = model)');
  console.log(`  ${pad('', 9)}${cols.map((c) => pad(c, colW, true)).join('')}`);
  for (const rowId of routeIds) {
    const cells = cols.map((c) => {
      const n = evaluable.filter((m) => actual(m) === rowId && predicted(m) === c).length;
      return pad(n, colW, true);
    });
    console.log(`  ${pad(rowId, 9)}${cells.join('')}`);
  }

  // --- 3. false-archive rate (the headline) ---------------------------------
  const nonNoise = evaluable.filter((m) => actual(m) !== ARCHIVE_ROUTE);
  const falseArchived = nonNoise.filter(
    (m) =>
      predicted(m) === ARCHIVE_ROUTE &&
      m.classification!.confidence >= config.archiveThreshold,
  );
  reportFalseArchive(falseArchived, nonNoise.length);
}

function modelsUsed(rows: MessageRow[]): string {
  const set = new Set(rows.map((r) => r.classification!.model).filter(Boolean));
  return set.size ? [...set].join(', ') : '(none)';
}

function reportFalseArchive(falseArchived: MessageRow[], nonNoiseTotal = 0): void {
  const rate = nonNoiseTotal === 0 ? 0 : falseArchived.length / nonNoiseTotal;
  const pass = rate <= FALSE_ARCHIVE_LIMIT;

  console.log('');
  console.log('FALSE ARCHIVE RATE — non-noise messages the model would hide');
  console.log(`  threshold ARCHIVE_THRESHOLD = ${config.archiveThreshold}`);
  console.log(
    `  ${falseArchived.length} / ${nonNoiseTotal} = ${pct(rate)}  ` +
      `${pass ? 'PASS' : 'FAIL'} (limit ${pct(FALSE_ARCHIVE_LIMIT)})`,
  );
  for (const m of falseArchived) {
    console.log(
      `    HIDDEN: @${m.sender.username} — your label "${m.human_route}", ` +
        `model "${m.classification!.route}" @ ${m.classification!.confidence.toFixed(2)}`,
    );
  }
  console.log('');
  process.exit(pass ? 0 : 1);
}

main();
