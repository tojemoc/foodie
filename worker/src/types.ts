// ── KV value shapes ───────────────────────────────────────────────────────────

export interface User {
  id:        string;
  username:  string;
  email:     string;
  createdAt: string;
}

/** Per-user notification / digest preferences (`prefs:{userId}`). */
export interface UserPrefs {
  /** Opt-in to the morning email digest (expires within the next week). */
  emailDigest: boolean;
  /** IANA timezone for 8:00 local delivery (default Europe/Bratislava). */
  timezone: string;
  /** Local calendar date (YYYY-MM-DD) of the last digest send. */
  lastDigestLocalDate?: string;
  updatedAt: string;
}

export interface Credential {
  userId:        string;
  publicKeyCose: string; // base64url
  counter:       number;
  transports:    string[];
}

export interface ChallengeData {
  userId?: string;
  email?:  string;
  type:    'register' | 'login';
}

export interface MagicLinkData {
  userId:  string;
  email:   string;
  expires: number;
}

// ── Item shape (shared with clients) ─────────────────────────────────────────

export interface Item {
  id:        string;
  name:      string;
  number:    string;
  format:    string;
  category:  string;
  notes:     string;
  productName?: string;
  brand?:       string;
  expiryDate?:  string; // YYYY-MM-DD
  placement?:   string;
  color:     string;
  emoji:     string;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use Item — kept as an alias during the Cardex → Foodie rename. */
export type Card = Item;

/** Records a deleted item so other devices know not to resurrect it. */
export interface Tombstone {
  id:        string;
  deletedAt: string;
}

// ── Worker env bindings ───────────────────────────────────────────────────────

export interface Env {
  FOODIE_KV:           KVNamespace;
  JWT_SECRET:          string;
  BREVO_API_KEY?:      string;
  /** base64url uncompressed P-256 public key (safe to expose to clients). */
  VAPID_PUBLIC_KEY?:   string;
  /** base64url raw 32-byte P-256 private key (secret). */
  VAPID_PRIVATE_KEY?:  string;
  FRONTEND_ORIGIN:     string;
  FRONTEND_RP_ID:      string;
  EMAIL_FROM:          string;
  EMAIL_FROM_NAME:     string;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface AuthResponse {
  token:    string;
  userId:   string;
  username: string;
}

export interface ApiError {
  error:   string;
  detail?: string;
}
