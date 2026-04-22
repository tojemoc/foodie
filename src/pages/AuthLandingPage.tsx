import { useEffect, useMemo, useState } from 'react';
import {
  startMagicLinkSignIn,
  signInWithPasskey,
  verifyMagicLinkToken,
  createAccountWithPasskey,
  type AuthUser,
} from '../services/cloudSyncAuth';

type Props = {
  onAuthenticated: (user: AuthUser, message: string) => void;
  cloudConfigured: boolean;
};

type Mode = 'signin' | 'signup';

export default function AuthLandingPage({ onAuthenticated, cloudConfigured }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmitEmail = useMemo(() => email.trim().length > 0, [email]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('magic_token');
    if (!token || !cloudConfigured) return;
    void (async () => {
      setBusy(true);
      setStatusMsg('');
      setMagicLink(null);
      try {
        const user = await verifyMagicLinkToken(token);
        const url = new URL(window.location.href);
        url.searchParams.delete('magic_token');
        window.history.replaceState({}, '', url.toString());
        setStatusMsg(`Signed in as ${user.email} via magic link.`);
        onAuthenticated(user, `Signed in as ${user.email} via magic link.`);
      } catch (err) {
        setStatusMsg(err instanceof Error ? err.message : 'Magic link verification failed.');
      } finally {
        setBusy(false);
      }
    })();
  }, [cloudConfigured, onAuthenticated]);

  async function handleMagicLink() {
    setBusy(true);
    setStatusMsg('');
    setMagicLink(null);
    try {
      const result = await startMagicLinkSignIn(email);
      if (result.magicLink) {
        setMagicLink(result.magicLink);
        setStatusMsg('Magic link generated locally (email provider not configured).');
      } else {
        setStatusMsg('Magic link sent. Check your inbox.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Magic link flow failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeySignIn() {
    setBusy(true);
    setStatusMsg('');
    try {
      const user = await signInWithPasskey(email || undefined);
      setStatusMsg(`Signed in as ${user.email}.`);
      onAuthenticated(user, `Signed in as ${user.email}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Passkey sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeyRegister() {
    setBusy(true);
    setStatusMsg('');
    try {
      const user = await createAccountWithPasskey(email);
      setStatusMsg(`Account ready for ${user.email}.`);
      onAuthenticated(user, `Created account for ${user.email}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Passkey registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">Foodie.</div>
      <p className="auth-subtitle">Track food expiry everywhere.</p>

      <div className="auth-card">
        {cloudConfigured ? (
          <>
            {mode === 'signin' ? (
              <>
                <h1>Welcome back</h1>
                <p className="auth-help">Sign in with your passkey, or get a magic link sent to your email.</p>

                <div className="form-group">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    disabled={busy}
                  />
                </div>

                <button className="btn btn-primary" onClick={handlePasskeySignIn} disabled={busy}>
                  Sign in with Passkey
                </button>

                <div className="auth-divider">or</div>

                <button className="btn btn-secondary" onClick={handleMagicLink} disabled={busy || !canSubmitEmail}>
                  Sign in with Magic Link
                </button>

                <button
                  className="auth-link-btn"
                  type="button"
                  onClick={() => setMode('signup')}
                  disabled={busy}
                >
                  Create an account →
                </button>
              </>
            ) : (
              <>
                <h1>Create account</h1>
                <p className="auth-help">Enter your email to register a passkey.</p>

                <div className="form-group">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    disabled={busy}
                  />
                </div>

                <button className="btn btn-primary" onClick={handlePasskeyRegister} disabled={busy || !canSubmitEmail}>
                  Register Passkey
                </button>

                <div className="auth-divider">or skip passkey</div>

                <button className="btn btn-secondary" onClick={handleMagicLink} disabled={busy || !canSubmitEmail}>
                  Use Magic Link instead
                </button>

                <button
                  className="auth-link-btn"
                  type="button"
                  onClick={() => setMode('signin')}
                  disabled={busy}
                >
                  ← Sign in
                </button>
              </>
            )}

            {statusMsg && <div className="status-banner info" style={{ marginTop: 12 }}>{statusMsg}</div>}
            {magicLink && (
              <div className="status-banner warning" style={{ marginTop: 8, marginBottom: 0 }}>
                <div style={{ marginBottom: 8, wordBreak: 'break-all' }}>{magicLink}</div>
                <button className="btn btn-secondary" style={{ width: 'auto', minHeight: 32, padding: '6px 10px' }} onClick={() => window.open(magicLink, '_self')}>
                  Open Magic Link
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1>Cloud auth not configured</h1>
            <p className="auth-help">Set `VITE_API_BASE_URL` to enable passkey + magic-link login and cloud sync.</p>
          </>
        )}
      </div>
    </div>
  );
}
