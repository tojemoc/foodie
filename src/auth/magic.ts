import { authMagicSend, authMagicVerify } from '../api.js';
import type { AuthResponse }              from '../types.js';

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  return authMagicSend(email);
}

export async function verifyMagicToken(token: string): Promise<AuthResponse> {
  return authMagicVerify(token);
}

/** Read ?magic= / ?token= from the current URL without verifying. */
export function peekMagicTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('magic') ?? params.get('token') ?? params.get('t');
  return token?.trim() || null;
}

/** Strip magic credentials from the address bar (does not call the API). */
export function stripMagicTokenFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('magic') && !params.has('token') && !params.has('t')) return;
  params.delete('magic');
  params.delete('token');
  params.delete('t');
  const qs = params.toString();
  const clean = window.location.origin + window.location.pathname + (qs ? `?${qs}` : '');
  window.history.replaceState({}, '', clean);
}

/** @deprecated Prefer peek + strip; kept for callers that want a one-shot read. */
export function consumeMagicTokenFromUrl(): string | null {
  const token = peekMagicTokenFromUrl();
  if (token) stripMagicTokenFromUrl();
  return token;
}

export function foodieDeepLinkForToken(token: string): string {
  return `foodie://auth/verify?token=${encodeURIComponent(token)}`;
}
