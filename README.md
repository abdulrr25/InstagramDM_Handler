# Instagram DM triage

A local-only tool for triaging Instagram DMs. It polls your DMs, classifies
each one (real lead / support / maybe / noise), and gives you one page on
`localhost` that shows only the messages worth your attention — and gets better
as you correct it.

- **Runs entirely on your machine.** No deploy, no public URL, no tunnel, no
  webhook. It fetches by polling the Instagram API on a timer.
- **Never sends a message to anyone.** There is no code path that transmits a
  message — the Instagram source only issues `GET` requests.
- **Works with zero credentials.** `npm install && npm run dev` starts in demo
  mode with fixture messages, an offline classifier, and the full UI. You can
  use the whole app before you have any API access.
- **No telemetry, no analytics, no phone-home.** Secrets live only in `.env`.

---

## Quick start (no credentials needed)

```bash
npm install
npm run seed     # load ~40 demo messages into ./data/inbox.db
npm run dev      # serve http://localhost:8787 and poll on a timer
```

Open **http://localhost:8787**. You'll see the demo DMs classified. Label a few
with the number keys, then:

```bash
npm run eval     # accuracy report against your labels
```

That's the whole loop — inbox → label → measure — with no account anywhere.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Serves `localhost:8787` and polls on a timer (`POLL_INTERVAL_MS`, default 60s). |
| `npm run poll` | One-shot fetch + classify. Useful for debugging. |
| `npm run seed` | Loads the demo fixtures into the database. |
| `npm run eval` | Precision/recall, confusion matrix, and false-archive rate. Exits non-zero if the false-archive rate is above 1%. |

Requires Node 20+. Everything runs directly with `tsx` — there is no build step.

---

## Using the review page

The default view (**Needs attention**) shows unlabelled messages on notify
routes, newest first — the point of the tool.

- **Each row** shows the sender handle + follower count, time, the first 140
  characters, the route as a coloured pill, the model's confidence, and its
  one-line reason.
- **Click a row** to expand the full text, all sender metadata, and the raw
  JSON (behind a collapsed toggle).
- **Relabel** with the buttons on every row. Number keys are bound via
  `accesskey` — press your browser's access-key chord + `1`/`2`/`3`/`4` to label
  the top row, which then reloads with the next message on top. (The chord is
  `Alt` on Windows/Linux, `Control`+`Option` on macOS Safari, `Alt` in Chrome.)
- **Tabs:** All / Needs attention / Noise / Unlabelled, with live counts.

Your labels are the ground truth. The model never writes them, and they're kept
separate from the model's verdicts so you can re-run the classifier and compare.

---

## How classification works

Each message is scored into one of the routes in [`src/config.ts`](src/config.ts).
The prompt is built from the route descriptions plus up to 20 of your most
recent hand-labelled messages as few-shot examples, and it includes the sender's
metadata (follower count, verification, whether they follow you) — often a
stronger signal than the text.

- **With a Groq key:** calls Groq's OpenAI-compatible endpoint with a plain
  `fetch` (no SDK). Output is validated with zod; a parse failure retries once,
  then stores `unknown` (which is always shown, never hidden). Get a free key at
  <https://console.groq.com/keys> and set `GROQ_API_KEY` in `.env`. Swapping to
  any other OpenAI-compatible provider is just a `GROQ_BASE_URL` change.
- **Without a key:** an offline keyword+metadata heuristic runs instead (stored
  as model `demo-heuristic`), so the demo and `eval` work with no account. It's
  intentionally conservative — it will mislabel some noise as `maybe`, but it
  won't route a real message to noise, because a hidden lead is the expensive
  error.

### The false-archive number

`npm run eval` ends with the **false-archive rate**: the share of *non-noise*
messages the model would have hidden at the current threshold. This is the
number that matters — a message labelled wrong but still visible costs you
nothing; a real lead silently hidden costs you a client. `eval` exits non-zero
if it's above 1%.

### Hiding

`ARCHIVE_THRESHOLD` (default `1.1`) is the confidence at or above which a
`noise` message is hidden from the default view. The default is deliberately
impossible, so **nothing is hidden until you lower it**. Hidden means filtered
from the default view only — never deleted, always visible under the **Noise**
tab. Lower it (e.g. `0.9`) once you trust the classifier.

---

## Changing the routes

Routes are defined once, in [`src/config.ts`](src/config.ts) — nothing else
hardcodes them. Edit the `routes` array to rename, re-describe, add, or remove a
route:

```ts
export const routes = [
  { id: 'lead', label: 'Real lead', action: 'notify',
    description: 'Names a specific need, brand, budget, or timeline.' },
  // ...
];
```

Rules enforced at startup (the app fails loudly if you break them):

- **Exactly one** route may have `action: 'archive'` (that's the one the hiding
  threshold applies to). All others are `'notify'`.
- Route ids must be unique, and none may be `unknown` (reserved for the model's
  validation-failure state).

The route id drives the pill colour via a `pill-<id>` CSS class in
[`src/ui/styles.ts`](src/ui/styles.ts); add a matching class for a new id, or it
falls back to a neutral pill.

---

## Configuration

Copy [`.env.example`](.env.example) to `.env` (gitignored) and set what you
need. Every variable is optional — the app runs fully in demo mode with none of
them.

| Variable | Default | Purpose |
|---|---|---|
| `SOURCE` | `demo` | `demo` or `instagram`. |
| `PORT` | `8787` | Local server port. |
| `POLL_INTERVAL_MS` | `60000` | Poll cadence for `npm run dev`. |
| `ARCHIVE_THRESHOLD` | `1.1` | Confidence to hide a `noise` message from the default view. |
| `GROQ_API_KEY` | — | Enables the LLM classifier. Unset → offline heuristic. |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model id. |
| `IG_ACCESS_TOKEN` | — | Required for `SOURCE=instagram`. |
| `IG_USER_ID` | — | Optional; your business account's IG-scoped id (else resolved from `/me`). |
| `IG_GRAPH_HOST` | `graph.instagram.com` | Graph host. |
| `IG_API_VERSION` | `v25.0` | API version. |
| `IG_MAX_CONVERSATION_PAGES` | `10` | Safety cap on conversation pagination per poll. |

Nothing secret is ever written to the database.

---

## Connecting real Instagram DMs

The Instagram source uses **Meta's Instagram API with Instagram Login**
(`graph.instagram.com`, `v25.0`). It only issues `GET` requests — it reads DMs,
it never sends.

**What you need:**

1. A Meta developer app with the **Instagram** product added
   (<https://developers.facebook.com/apps>).
2. An **Instagram professional account** (Business or Creator) that you can log
   in with through the app.
3. An access token carrying these scopes:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`

**Then:**

```bash
# in .env
SOURCE=instagram
IG_ACCESS_TOKEN=<your token>
```

```bash
npm run poll     # first real fetch — the true smoke test
npm run dev      # or run the server + timer
```

**Endpoints used** (confirmed against the live docs):

| Purpose | Request |
|---|---|
| List conversations | `GET /me/conversations?platform=instagram` |
| Messages in a conversation | `GET /{conversation-id}?fields=messages{id,created_time,from,message}` |
| Sender profile | `GET /{igsid}?fields=name,username,follower_count,is_user_follow_business,is_business_follow_user,is_verified_user` |
| Pagination | cursor-based; follows `paging.next` |

**Known limitations of the Meta API** (not bugs in this tool):

- Only the **20 most recent** messages per conversation are queryable.
- A sender's profile (follower count, verification, follows-you) is only
  available **after they've messaged you**, and not if they've blocked the app.
- `bio`, following-count, and an `is_business` flag are **not exposed** by this
  API, so those fields stay empty; the classifier treats missing metadata as
  unknown.

Docs:
[Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api/) ·
[User Profile API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/) ·
[Pagination](https://developers.facebook.com/docs/graph-api/results)

---

## Project layout

```
src/
  config.ts          routes (single source of truth) + env config + validation
  types.ts           Message / Sender / Classification / MessageRow
  db.ts              better-sqlite3 schema + inserts (./data/inbox.db)
  queries.ts         read/write helpers, tab filtering, hiding logic
  poll.ts            one poll cycle: fetch -> insert -> classify
  classify.ts        Groq call + zod validation + retry; offline heuristic
  server.ts          hono server: review page, stylesheet, relabel POST
  dev.ts             server + poll timer (npm run dev)
  sources/
    index.ts         picks demo vs instagram by SOURCE
    demo.ts          fixtures as a source
    instagram.ts     real DMs via the Instagram API (GET only)
  ui/
    render.ts        server-rendered HTML
    styles.ts        one hand-written stylesheet
  scripts/
    seed.ts poll.ts eval.ts
fixtures/demo.json   ~40 demo messages (replace with your own)
data/inbox.db        SQLite database (gitignored)
```

## Data & privacy

Everything stays on your machine: messages, labels, and model verdicts live in
`./data/inbox.db`. The only outbound network calls are (a) reading your DMs from
the Instagram API and (b) the classifier request to your chosen LLM endpoint —
both only when you've configured them. No third party is ever sent your
messages.
