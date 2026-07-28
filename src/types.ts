// Shared domain types. The classifier's zod schema lives in classify.ts;
// these are the plain shapes that flow between source -> db -> UI.

/**
 * Sender metadata. Everything past `id`/`username` is optional because the
 * demo source and the real Instagram API expose different subsets, and the
 * classifier treats missing fields as "unknown" rather than "false".
 */
export interface Sender {
  id: string;
  username: string;
  name?: string;
  bio?: string;
  followers_count?: number;
  follows_count?: number;
  is_verified?: boolean;
  /** Does this account follow the inbox owner? */
  follows_you?: boolean;
  is_business?: boolean;
}

/** A single inbound direct message, normalized across sources. */
export interface Message {
  /** Platform message id. Unique per message; used for dedupe. */
  external_id: string;
  thread_id: string;
  sender: Sender;
  text: string;
  received_at: Date;
  /** Whatever the source returned, verbatim, for auditing in the UI. */
  raw: unknown;
}
