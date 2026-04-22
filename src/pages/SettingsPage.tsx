import { useEffect, useState } from 'react';
import { requestNotificationPermission, checkExpiringSoon } from '../services/notifications';
import {
  getCurrentAuthUser,
  startMagicLinkSignIn,
  verifyMagicLinkToken,
  registerPasskey,
  signInWithPasskey,
  pushLocalSnapshotToCloud,
  pullCloudSnapshotToLocal,
  logoutAuthSession,
  isCloudSyncConfigured,
  type AuthUser,
} from '../services/cloudSyncAuth';

export default function SettingsPage() {
  const [notifStatus, setNotifStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [email, setEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [copiedMagicLink, setCopiedMagicLink] = useState<string | null>(null);
  const cloudConfigured = isCloudSyncConfigured();

  useEffect(() => {
    void (async () => {
      if (!cloudConfigured) return;
      try {
        const user = await getCurrentAuthUser();
        setAuthUser(user);
      } catch {
        setAuthUser(null);
      }
    })();
  }, [cloudConfigured]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('magic_token');
    if (!token || !cloudConfigured) return;
    void (async () => {
      setBusy(true);
      try {
        const user = await verifyMagicLinkToken(token);
        setAuthUser(user);
        setStatusMsg(`Signed in as ${user.email} via magic link.`);
        const url = new URL(window.location.href);
        url.searchParams.delete('magic_token');
        window.history.replaceState({}, '', url.toString());
      } catch (err) {
        console.error(err);
        setStatusMsg(err instanceof Error ? err.message : 'Magic link sign-in failed.');
      } finally {
        setBusy(false);
      }
    })();
  }, [cloudConfigured]);

  async function handleEnableNotifications() {
    const permission = await requestNotificationPermission();
    setNotifStatus(permission);
    if (permission === 'granted') {
      await checkExpiringSoon();
    }
  }

  async function handleMagicLinkStart() {
    setBusy(true);
    setStatusMsg('');
    try {
      const result = await startMagicLinkSignIn(email);
      setCopiedMagicLink(null);
      if (result.magicLink) {
        setCopiedMagicLink(result.magicLink);
        setStatusMsg('Magic link generated locally (email provider not configured).');
      } else {
        setStatusMsg('Magic link sent. Check your inbox.');
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Failed to start magic link sign-in.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterPasskey() {
    setBusy(true);
    setStatusMsg('');
    try {
      const count = await registerPasskey();
      const refreshed = await getCurrentAuthUser();
      setAuthUser(refreshed);
      setStatusMsg(`Passkey saved. You now have ${count} passkey${count === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Passkey registration failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeySignIn() {
    setBusy(true);
    setStatusMsg('');
    try {
      const user = await signInWithPasskey(email || undefined);
      setAuthUser(user);
      setStatusMsg(`Signed in as ${user.email} with passkey.`);
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Passkey sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncPush() {
    setBusy(true);
    setStatusMsg('');
    try {
      const result = await pushLocalSnapshotToCloud();
      setStatusMsg(`Cloud push complete (${result.itemCount} items, ${result.locationCount} locations).`);
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Cloud push failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncPull() {
    setBusy(true);
    setStatusMsg('');
    try {
      const result = await pullCloudSnapshotToLocal();
      if (!result) {
        setStatusMsg('No cloud snapshot found yet.');
      } else {
        setStatusMsg(`Cloud pull complete (${result.itemCount} items, ${result.locationCount} locations).`);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Cloud pull failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setStatusMsg('');
    try {
      await logoutAuthSession();
      setAuthUser(null);
      setStatusMsg('Signed out.');
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof Error ? err.message : 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card">
        <div className="settings-item">
          <div>
            <div style={{ fontWeight: 600 }}>Notifications</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {notifStatus === 'granted' && 'Enabled'}
              {notifStatus === 'denied' && 'Denied \u2014 enable in browser settings'}
              {notifStatus === 'default' && 'Not yet requested'}
              {notifStatus === 'unsupported' && 'Not supported in this browser'}
            </div>
          </div>
          {notifStatus !== 'granted' && notifStatus !== 'unsupported' && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleEnableNotifications}>
              Enable
            </button>
          )}
        </div>

        <div className="settings-item">
          <div>
            <div style={{ fontWeight: 600 }}>Version</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>0.1.0 \u2014 PoC</div>
          </div>
        </div>

        <div className="settings-item">
          <div>
            <div style={{ fontWeight: 600 }}>Data</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stored locally in IndexedDB</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <p className="section-title">Cloud Auth & Sync</p>
        {!cloudConfigured ? (
          <div className="status-banner warning" style={{ marginBottom: 0 }}>
            Set <code>VITE_API_BASE_URL</code> to enable magic link, passkeys, and KV sync.
          </div>
        ) : (
          <>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="btn btn-secondary" onClick={handleMagicLinkStart} disabled={busy || !email.trim()}>
                Send Magic Link
              </button>
              <button className="btn btn-secondary" onClick={handlePasskeySignIn} disabled={busy}>
                Sign In with Passkey
              </button>
              <button className="btn btn-secondary" onClick={handleRegisterPasskey} disabled={busy || !authUser}>
                Register New Passkey
              </button>
              <button className="btn btn-secondary" onClick={handleSyncPush} disabled={busy || !authUser}>
                Push Local → Cloud
              </button>
              <button className="btn btn-secondary" onClick={handleSyncPull} disabled={busy || !authUser}>
                Pull Cloud → Local
              </button>
              <button className="btn btn-danger" onClick={handleLogout} disabled={busy || !authUser}>
                Sign Out
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {authUser
                ? `Signed in as ${authUser.email} • ${authUser.passkeyCount} passkey${authUser.passkeyCount === 1 ? '' : 's'}`
                : 'Not signed in'}
            </div>
            {statusMsg && (
              <div className="status-banner info" style={{ marginTop: 12, marginBottom: 0 }}>
                {statusMsg}
              </div>
            )}
            {copiedMagicLink && (
              <div className="status-banner warning" style={{ marginTop: 8, marginBottom: 0 }}>
                <div style={{ marginBottom: 8, wordBreak: 'break-all' }}>{copiedMagicLink}</div>
                <button
                  className="btn btn-secondary"
                  style={{ width: 'auto', minHeight: 32, padding: '6px 10px' }}
                  onClick={() => window.open(copiedMagicLink, '_self')}
                >
                  Open Magic Link
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Foodie \u2014 Grocery Checking/Management that is painless
      </div>
    </div>
  );
}
