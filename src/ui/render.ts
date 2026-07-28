// Server-rendered HTML. Plain template strings, escaped. No client framework.
import { routes, routeById, UNKNOWN_ROUTE } from '../config.js';
import { effectiveRoute, isHidden } from '../queries.js';
import type { Tab } from '../queries.js';
import type { MessageRow, Sender } from '../types.js';
import { STYLES } from './styles.js';

/** Escape text for safe interpolation into HTML. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TAB_LABELS: Record<Tab, string> = {
  needs: 'Needs attention',
  all: 'All',
  noise: 'Noise',
  unlabelled: 'Unlabelled',
};
const TAB_ORDER: Tab[] = ['all', 'needs', 'noise', 'unlabelled'];

function fmtCount(n: number | undefined): string {
  if (n === undefined) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function ago(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Pill class + label for a route id (or null / unknown). */
function pill(routeId: string | null): string {
  if (routeId === null) {
    return `<span class="pill pill-none">unclassified</span>`;
  }
  if (routeId === UNKNOWN_ROUTE) {
    return `<span class="pill pill-unknown">unknown</span>`;
  }
  const r = routeById(routeId);
  const label = r ? r.label : routeId;
  return `<span class="pill pill-${esc(routeId)}">${esc(label)}</span>`;
}

function senderMetaLine(s: Sender): string {
  const bits: string[] = [`${fmtCount(s.followers_count)} followers`];
  if (s.follows_you) bits.push('follows you');
  if (s.is_business) bits.push('business');
  return bits.join(' · ');
}

function labelButtons(row: MessageRow): string {
  // One button per route, rendered inside the always-visible <summary> so
  // labelling never requires expanding a row. accesskey = the route's 1-based
  // index; a shared accesskey activates the topmost row, giving a fast
  // "label the top one, it reloads, repeat" flow.
  return (
    `<span class="label-actions">` +
    routes
      .map((r, i) => {
        const current = row.human_route === r.id ? ' current' : '';
        const key = i + 1;
        return (
          `<button type="submit" name="route" value="${esc(r.id)}"` +
          ` accesskey="${key}" class="btn${current}"` +
          ` title="${esc(r.description)}">${esc(r.label)}` +
          `<span class="k">${key}</span></button>`
        );
      })
      .join('') +
    `</span>`
  );
}

function detail(row: MessageRow): string {
  const s = row.sender;
  const rows: Array<[string, string | undefined]> = [
    ['Handle', `@${s.username}`],
    ['Name', s.name || undefined],
    ['Bio', s.bio || undefined],
    ['Followers', fmtCount(s.followers_count)],
    ['Following', fmtCount(s.follows_count)],
    ['Verified', s.is_verified ? 'yes' : 'no'],
    ['Follows you', s.follows_you ? 'yes' : 'no'],
    ['Business', s.is_business ? 'yes' : 'no'],
    ['Thread', row.thread_id],
    ['Received', row.received_at.toISOString()],
  ];
  const dl = rows
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join('');

  const c = row.classification;
  const model = c
    ? `<dt>Model</dt><dd>${esc(c.model)} · ${c.confidence.toFixed(2)} · ${esc(c.reason)}</dd>`
    : '';

  return (
    `<div class="detail">` +
    `<p class="full">${esc(row.text)}</p>` +
    `<dl class="sender">${dl}${model}</dl>` +
    `<details class="raw"><summary>Raw JSON</summary>` +
    `<pre class="raw">${esc(JSON.stringify(row.raw, null, 2))}</pre></details>` +
    `</div>`
  );
}

function rowHtml(row: MessageRow, tab: Tab): string {
  const s = row.sender;
  const handle =
    `@${esc(s.username)}` +
    (s.is_verified ? ` <span class="verified" title="verified">✓</span>` : '');
  const snippetText = row.text.slice(0, 140) + (row.text.length > 140 ? '…' : '');
  const labeledAs = row.human_route
    ? ` <span class="labeled-as">→ ${esc(routeById(row.human_route)?.label ?? row.human_route)}</span>`
    : '';
  const shownRoute = effectiveRoute(row);
  const conf =
    row.classification && row.human_route === null
      ? `<span class="conf">${row.classification.confidence.toFixed(2)}</span>`
      : '';
  const reason =
    row.classification && row.human_route === null
      ? `<span class="reason">${esc(row.classification.reason)}</span>`
      : '';
  const hiddenTag = isHidden(row) ? ` <span class="labeled-as">(hidden)</span>` : '';

  // The whole row is one form so the label buttons — placed in the always-
  // visible <summary> — post without expanding the row. Clicking anywhere
  // else in the summary toggles the <details> to reveal full text + metadata.
  return (
    `<form class="row" method="post" action="/label">` +
    `<input type="hidden" name="id" value="${row.id}">` +
    `<input type="hidden" name="tab" value="${esc(tab)}">` +
    `<details id="m${row.id}">` +
    `<summary>` +
    `<span class="who">` +
    `<div class="handle">${handle}</div>` +
    `<div class="meta">${esc(senderMetaLine(s))} · ${ago(row.received_at)} ago</div>` +
    `</span>` +
    `<span class="snippet">${esc(snippetText)}${labeledAs}${hiddenTag}</span>` +
    `<span class="verdict">${reason}${conf}${pill(shownRoute)}</span>` +
    labelButtons(row) +
    `</summary>` +
    detail(row) +
    `</details>` +
    `</form>`
  );
}

function tabsNav(active: Tab, counts: Record<Tab, number>): string {
  return (
    `<nav class="tabs">` +
    TAB_ORDER.map((t) => {
      const cls = t === active ? 'active' : '';
      return (
        `<a class="${cls}" href="/?tab=${t}">${TAB_LABELS[t]} ` +
        `<span class="count">${counts[t]}</span></a>`
      );
    }).join('') +
    `</nav>`
  );
}

export function page(opts: {
  tab: Tab;
  rows: MessageRow[];
  counts: Record<Tab, number>;
}): string {
  const { tab, rows, counts } = opts;

  const keyLegend = routes
    .map((r, i) => `<kbd>${i + 1}</kbd> ${esc(r.label)}`)
    .join(' &nbsp; ');

  const body =
    rows.length === 0
      ? emptyState(tab)
      : `<ul class="list">${rows.map((r) => `<li>${rowHtml(r, tab)}</li>`).join('')}</ul>`;

  return (
    `<!doctype html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>DM triage — ${TAB_LABELS[tab]}</title>` +
    `<link rel="stylesheet" href="/styles.css">` +
    `</head><body>` +
    `<header>` +
    `<div class="masthead"><h1>DM triage</h1>` +
    `<span class="sub">local · never sends · newest first</span></div>` +
    tabsNav(tab, counts) +
    `<div class="keyhint">Label the top row with your browser's access key + ${keyLegend}</div>` +
    `</header>` +
    `<main>${body}</main>` +
    `</body></html>`
  );
}

function emptyState(tab: Tab): string {
  if (tab === 'needs') {
    return (
      `<div class="empty">Nothing needs attention. ` +
      `New messages land here newest-first — or label from the ` +
      `<a href="/?tab=unlabelled">Unlabelled</a> tab.</div>`
    );
  }
  return `<div class="empty">Nothing here yet. Try <a href="/?tab=all">All</a>.</div>`;
}

export { STYLES };
