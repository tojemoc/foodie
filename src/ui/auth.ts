import { registerWithPasskey }          from '../auth/passkey.js';
import { loginWithPasskey }             from '../auth/passkey.js';
import {
  sendMagicLink,
  verifyMagicToken,
  peekMagicTokenFromUrl,
  stripMagicTokenFromUrl,
  foodieDeepLinkForToken,
} from '../auth/magic.js';
import { saveSession, clearSession }   from '../auth/session.js';
import type { AuthResponse }           from '../types.js';

let pendingMagicToken: string | null = null;

// ── Panel switching ───────────────────────────────────────────────────────────

type Panel = 'login' | 'register' | 'magic';

export function showPanel(panel: Panel): void {
  const ids: Record<Panel, string> = {
    login:    'auth-login-panel',
    register: 'auth-register-panel',
    magic:    'auth-magic-panel',
  };
  for (const [key, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.style.display = key === panel ? 'flex' : 'none';
  }
  if (panel === 'magic') {
    setTimeout(() => document.getElementById('magic-email')?.focus(), 50);
  }
}

// ── Auth screen visibility ────────────────────────────────────────────────────

export function showAuthScreen(): void {
  document.getElementById('auth-screen')!.style.display    = 'flex';
  document.getElementById('magic-handoff')!.style.display   = 'none';
  document.getElementById('magic-verifying')!.style.display = 'none';
  document.getElementById('main-app')!.style.display        = 'none';
}

export function showHandoffScreen(): void {
  document.getElementById('auth-screen')!.style.display    = 'none';
  document.getElementById('magic-handoff')!.style.display   = 'flex';
  document.getElementById('magic-verifying')!.style.display = 'none';
  document.getElementById('main-app')!.style.display        = 'none';
}

export function showVerifyingScreen(): void {
  document.getElementById('auth-screen')!.style.display    = 'none';
  document.getElementById('magic-handoff')!.style.display   = 'none';
  document.getElementById('magic-verifying')!.style.display = 'flex';
  document.getElementById('main-app')!.style.display        = 'none';
}

// ── Error / success banners ───────────────────────────────────────────────────

export function showAuthError(panel: Panel, msg: string): void {
  const el = document.getElementById(`${panel}-error`);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showAuthSuccess(panel: Panel, msg: string): void {
  const el = document.getElementById(`${panel}-success`);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

// ── Loading state ─────────────────────────────────────────────────────────────

function setLoading(btnId: string, on: boolean, label: string): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled    = on;
  btn.textContent = on ? 'Please wait…' : label;
}

// ── Passkey register ──────────────────────────────────────────────────────────

export async function handleRegister(): Promise<AuthResponse | null> {
  const email = (document.getElementById('reg-email') as HTMLInputElement).value.trim();
  if (!email || !email.includes('@')) {
    showAuthError('register', 'Please enter a valid email address');
    return null;
  }
  setLoading('register-btn', true, 'Register Passkey');
  try {
    const result = await registerWithPasskey(email);
    if (result.error) { showAuthError('register', result.error); return null; }
    return result;
  } catch (e) {
    const err = e as Error;
    showAuthError('register', err.name === 'NotAllowedError' ? 'Biometric prompt cancelled.' : err.message);
    return null;
  } finally {
    setLoading('register-btn', false, 'Register Passkey');
  }
}

// ── Passkey login ─────────────────────────────────────────────────────────────

export async function handleLogin(): Promise<AuthResponse | null> {
  setLoading('login-btn', true, 'Sign in with Passkey');
  try {
    const result = await loginWithPasskey();
    if (result.error) { showAuthError('login', result.error); return null; }
    return result;
  } catch (e) {
    const err = e as Error;
    showAuthError('login', err.name === 'NotAllowedError' ? 'Biometric prompt cancelled.' : err.message);
    return null;
  } finally {
    setLoading('login-btn', false, 'Sign in with Passkey');
  }
}

// ── Magic link send ───────────────────────────────────────────────────────────

export async function handleMagicSend(): Promise<void> {
  const emailEl = document.getElementById('magic-email') as HTMLInputElement;
  const email   = emailEl.value.trim();
  if (!email || !email.includes('@')) {
    showAuthError('magic', 'Please enter a valid email address');
    return;
  }
  const btn = document.getElementById('magic-btn') as HTMLButtonElement;
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    const { ok, error } = await sendMagicLink(email);
    if (error) { showAuthError('magic', error); return; }
    if (ok) {
      emailEl.style.display = 'none';
      btn.style.display     = 'none';
      showAuthSuccess('magic', `✉️ Link sent to ${email} — check your inbox. Expires in 15 minutes.`);
    }
  } catch {
    showAuthError('magic', 'Could not send email. Check your connection.');
  } finally {
    if (btn.style.display !== 'none') {
      btn.disabled    = false;
      btn.textContent = 'Send Magic Link';
    }
  }
}

// ── Magic link handoff (called on page load if ?magic= / ?token= present) ─────
// Important: do NOT call /auth/magic/verify until the user chooses "Continue in
// this browser". Opening the email link used to burn the one-time token before
// the native app (or Paste / open verify) could redeem it.

export function prepareMagicHandoff(): boolean {
  const token = peekMagicTokenFromUrl();
  if (!token) return false;

  pendingMagicToken = token;
  // Strip from the address bar so refresh doesn't look like a fresh open,
  // but keep the token in memory for Open app / Continue web.
  stripMagicTokenFromUrl();
  showHandoffScreen();

  const err = document.getElementById('magic-handoff-error');
  if (err) {
    err.textContent = '';
    err.classList.remove('show');
  }
  return true;
}

export function openFoodieAppFromHandoff(): void {
  if (!pendingMagicToken) return;
  window.location.href = foodieDeepLinkForToken(pendingMagicToken);
}

export async function continueMagicInBrowser(): Promise<AuthResponse | null> {
  const token = pendingMagicToken;
  if (!token) return null;

  showVerifyingScreen();
  try {
    const result = await verifyMagicToken(token);
    if (result.error) {
      pendingMagicToken = null;
      showAuthScreen();
      showPanel('magic');
      showAuthError('magic',
        result.error === 'Link expired or already used'
          ? 'This link has expired or was already used. Please request a new one.'
          : result.error,
      );
      return null;
    }
    pendingMagicToken = null;
    return result;
  } catch {
    showAuthScreen();
    showPanel('magic');
    showAuthError('magic', 'Verification failed — please try again.');
    return null;
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export function handleSignOut(onDone: () => void): void {
  if (!confirm('Sign out?')) return;
  clearSession();
  onDone();
}
