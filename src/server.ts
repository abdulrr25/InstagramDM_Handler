// Local HTTP server: the review page, the stylesheet, and the relabel POST.
// No auth, binds to localhost only — this runs on the owner's laptop.
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { getView, setHumanLabel } from './queries.js';
import type { Tab } from './queries.js';
import { page, STYLES } from './ui/render.js';

const VALID_TABS: Tab[] = ['needs', 'all', 'noise', 'unlabelled'];

function parseTab(v: unknown): Tab {
  return VALID_TABS.includes(v as Tab) ? (v as Tab) : 'needs';
}

export function createApp(): Hono {
  const app = new Hono();

  app.get('/styles.css', (c) => {
    c.header('Content-Type', 'text/css; charset=utf-8');
    return c.body(STYLES);
  });

  // Avoid a 404 on every page load; this is a local tool with no icon.
  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/', (c) => {
    const tab = parseTab(c.req.query('tab'));
    const { rows, counts } = getView(tab);
    return c.html(page({ tab, rows, counts }));
  });

  app.post('/label', async (c) => {
    const body = await c.req.parseBody();
    const tab = parseTab(body['tab']);
    const id = Number(body['id']);
    const route = String(body['route'] ?? '');
    if (Number.isInteger(id) && route) {
      try {
        setHumanLabel(id, route);
      } catch (err) {
        console.error('[label] failed:', err);
      }
    }
    // Redirect back to the same view so labelling is one round-trip.
    return c.redirect(`/?tab=${tab}`, 303);
  });

  return app;
}

/** Start the server. Returns once it is listening. */
export function startServer(): void {
  const app = createApp();
  serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' });
  console.log(`[server] http://localhost:${config.port}`);
}
