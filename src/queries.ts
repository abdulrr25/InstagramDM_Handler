// Read/write helpers for the review UI and eval. Pure filtering lives here so
// the server stays about HTTP and the renderers stay about HTML.
import { getDb } from './db.js';
import {
  archiveRouteIds,
  config,
  routeIds,
  notifyRouteIds,
} from './config.js';
import type { MessageRow, Sender } from './types.js';

const ARCHIVE_ROUTE = archiveRouteIds[0]!; // exactly one, validated at startup

export type Tab = 'needs' | 'all' | 'noise' | 'unlabelled';

interface Raw {
  id: number;
  external_id: string;
  thread_id: string;
  sender_json: string;
  text: string;
  raw_json: string;
  received_at: string;
  status: string;
  human_route: string | null;
  route: string | null;
  confidence: number | null;
  reason: string | null;
  model: string | null;
  created_at: string | null;
}

/** All messages with their latest classification, newest first. */
export function getAllRows(): MessageRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT m.id, m.external_id, m.thread_id, m.sender_json, m.text, m.raw_json,
             m.received_at, m.status, m.human_route,
             c.route, c.confidence, c.reason, c.model, c.created_at
      FROM messages m
      LEFT JOIN classifications c ON c.id = (
        SELECT c2.id FROM classifications c2
        WHERE c2.message_id = m.id ORDER BY c2.id DESC LIMIT 1
      )
      ORDER BY m.received_at DESC
      `,
    )
    .all() as Raw[];

  return rows.map((r): MessageRow => ({
    id: r.id,
    external_id: r.external_id,
    thread_id: r.thread_id,
    sender: JSON.parse(r.sender_json) as Sender,
    text: r.text,
    received_at: new Date(r.received_at),
    status: r.status,
    human_route: r.human_route,
    raw: JSON.parse(r.raw_json),
    classification:
      r.route === null
        ? null
        : {
            route: r.route,
            confidence: r.confidence ?? 0,
            reason: r.reason ?? '',
            model: r.model ?? '',
            created_at: r.created_at ?? '',
          },
  }));
}

/**
 * The route we treat a message as being in: the human label wins, otherwise
 * the model's route, otherwise null (never seen by the classifier).
 */
export function effectiveRoute(row: MessageRow): string | null {
  return row.human_route ?? row.classification?.route ?? null;
}

/**
 * Hidden from the default view: a message the model routed to the archive
 * route with confidence at/above the threshold. Human-labelled messages and
 * unclassified messages are never auto-hidden. Threshold default (1.1) is
 * impossible, so nothing hides until the owner lowers it.
 */
export function isHidden(row: MessageRow): boolean {
  if (row.human_route) return false;
  const c = row.classification;
  return (
    c !== null &&
    c.route === ARCHIVE_ROUTE &&
    c.confidence >= config.archiveThreshold
  );
}

function filterTab(rows: MessageRow[], tab: Tab): MessageRow[] {
  switch (tab) {
    case 'needs':
      // The whole point: unlabelled and not hidden. Unclassified messages show
      // here too (they can't be hidden) so labelling works before the classifier.
      return rows.filter((r) => r.human_route === null && !isHidden(r));
    case 'unlabelled':
      return rows.filter((r) => r.human_route === null);
    case 'noise':
      // Everything in the archive route stays visible here, hidden or not.
      return rows.filter((r) => effectiveRoute(r) === ARCHIVE_ROUTE);
    case 'all':
    default:
      return rows;
  }
}

export interface ViewData {
  rows: MessageRow[];
  counts: Record<Tab, number>;
}

export function getView(tab: Tab): ViewData {
  const all = getAllRows();
  return {
    rows: filterTab(all, tab),
    counts: {
      needs: filterTab(all, 'needs').length,
      all: all.length,
      noise: filterTab(all, 'noise').length,
      unlabelled: filterTab(all, 'unlabelled').length,
    },
  };
}

/** Record a human label. Validates the route against config. */
export function setHumanLabel(messageId: number, route: string): void {
  if (!routeIds.includes(route)) {
    throw new Error(`Unknown route: ${route}`);
  }
  const db = getDb();
  const res = db
    .prepare(`UPDATE messages SET human_route = ?, status = 'labeled' WHERE id = ?`)
    .run(route, messageId);
  if (res.changes === 0) {
    throw new Error(`No message with id ${messageId}`);
  }
}

export { ARCHIVE_ROUTE, notifyRouteIds };
