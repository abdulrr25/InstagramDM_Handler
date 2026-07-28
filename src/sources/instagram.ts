// Instagram ingestion source. Reads inbound DMs via Meta's Instagram API with
// Instagram Login (graph.instagram.com, v25.0). Endpoints, fields, pagination
// and scopes were confirmed against the live docs (see README > Instagram):
//
//   list conversations : GET /me/conversations?platform=instagram
//   messages in a convo: GET /{CONVERSATION_ID}?fields=messages{id,created_time,from,message}
//   sender profile     : GET /{IGSID}?fields=name,username,follower_count,
//                             is_user_follow_business,is_business_follow_user,is_verified_user
//   pagination         : cursor-based; follow paging.next directly
//   scopes             : instagram_business_basic, instagram_business_manage_messages
//
// This source never sends anything — it only issues GETs.
import { config } from '../config.js';
import type { Message, Sender } from '../types.js';

const ig = config.instagram;
const BASE = `https://${ig.graphHost}/${ig.apiVersion}`;

// --- API response shapes (only the fields we read) --------------------------
interface GraphError {
  error?: { message?: string; code?: number; type?: string };
}
interface Paging {
  paging?: { next?: string; cursors?: { after?: string; before?: string } };
}
interface Conversation {
  id: string;
  updated_time?: string;
}
interface MessageFrom {
  id: string;
  username?: string;
}
interface ApiMessage {
  id: string;
  created_time: string;
  from?: MessageFrom;
  message?: string;
}
interface Profile {
  id?: string;
  name?: string;
  username?: string;
  follower_count?: number;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
  is_verified_user?: boolean;
}

/**
 * GET a Graph API node. Accepts either a path (joined to BASE) or a full URL
 * (for following paging.next). The access token is added as a query param per
 * Meta's documented usage; request URLs are never logged (they carry the token).
 */
async function graphGet<T>(
  pathOrUrl: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(`${BASE}/${pathOrUrl}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has('access_token')) {
    url.searchParams.set('access_token', ig.accessToken);
  }

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Instagram API request failed: ${(err as Error).message}`);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Instagram API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  const errObj = (json as GraphError).error;
  if (!res.ok || errObj) {
    const detail = errObj?.message ?? text.slice(0, 200);
    const code = errObj?.code !== undefined ? ` (code ${errObj.code})` : '';
    throw new Error(`Instagram API ${res.status}: ${detail}${code}`);
  }
  return json as T;
}

/** The business account's own IG-scoped id, so we can drop outbound messages. */
let businessIdCache: string | null = null;
async function resolveBusinessId(): Promise<string> {
  if (ig.userId) return ig.userId;
  if (businessIdCache) return businessIdCache;
  const me = await graphGet<{ user_id?: string; id?: string }>('me', {
    fields: 'user_id,username',
  });
  const id = me.user_id ?? me.id;
  if (!id) throw new Error('Could not resolve business account id from /me');
  businessIdCache = id;
  return id;
}

/** List conversation ids touched at/after `since`, following cursor pages. */
async function listConversations(since: Date): Promise<Conversation[]> {
  const out: Conversation[] = [];
  let page = await graphGet<{ data?: Conversation[] } & Paging>('me/conversations', {
    platform: 'instagram',
    fields: 'id,updated_time',
  });

  for (let i = 0; i < ig.maxConversationPages; i++) {
    const data = page.data ?? [];
    for (const c of data) out.push(c);

    // Conversations come newest-activity first; once a full page predates
    // `since`, later pages can only be older — stop paging.
    const lastUpdated = data.at(-1)?.updated_time;
    if (lastUpdated && new Date(lastUpdated) < since) break;

    const next = page.paging?.next;
    if (!next) break;
    page = await graphGet<{ data?: Conversation[] } & Paging>(next);
  }
  return out;
}

/** Recent messages (id, time, sender, text) for one conversation. */
async function getConversationMessages(conversationId: string): Promise<ApiMessage[]> {
  const resp = await graphGet<{ messages?: { data?: ApiMessage[] } }>(conversationId, {
    fields: 'messages{id,created_time,from,message}',
  });
  return resp.messages?.data ?? [];
}

/** Enrich a sender with profile metadata. Returns null if consent/blocked. */
const profileCache = new Map<string, Profile | null>();
async function getProfile(igsid: string): Promise<Profile | null> {
  if (profileCache.has(igsid)) return profileCache.get(igsid) ?? null;
  let profile: Profile | null = null;
  try {
    profile = await graphGet<Profile>(igsid, {
      fields:
        'name,username,follower_count,is_user_follow_business,is_business_follow_user,is_verified_user',
    });
  } catch (err) {
    // Profile access needs the user's consent and isn't available if they've
    // blocked the app. Not fatal — fall back to the id/username on the message.
    console.error(`[instagram] profile ${igsid} unavailable:`, (err as Error).message);
    profile = null;
  }
  profileCache.set(igsid, profile);
  return profile;
}

function toSender(from: MessageFrom, profile: Profile | null): Sender {
  return {
    id: from.id,
    username: profile?.username ?? from.username ?? from.id,
    name: profile?.name,
    followers_count: profile?.follower_count,
    is_verified: profile?.is_verified_user,
    // "user follows the business" is exactly "does this account follow you".
    follows_you: profile?.is_user_follow_business,
    // bio, following-count and an is_business flag are not exposed by this API.
  };
}

export async function fetchRecent(since: Date): Promise<Message[]> {
  if (!ig.accessToken) {
    throw new Error('IG_ACCESS_TOKEN not set. See .env.example / README.');
  }

  const businessId = await resolveBusinessId();
  profileCache.clear(); // refresh metadata each poll

  const conversations = await listConversations(since);
  const out: Message[] = [];

  for (const conv of conversations) {
    const messages = await getConversationMessages(conv.id);
    for (const m of messages) {
      const receivedAt = new Date(m.created_time);
      if (Number.isNaN(receivedAt.getTime()) || receivedAt < since) continue;
      if (!m.from || m.from.id === businessId) continue; // skip our own outbound

      const profile = await getProfile(m.from.id);
      out.push({
        external_id: m.id,
        thread_id: conv.id,
        sender: toSender(m.from, profile),
        text: m.message ?? '',
        received_at: receivedAt,
        raw: { message: m, profile },
      });
    }
  }

  return out.sort((a, b) => b.received_at.getTime() - a.received_at.getTime());
}
