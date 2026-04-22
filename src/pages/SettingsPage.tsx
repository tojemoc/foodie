import { useEffect, useState } from 'react';
import { requestNotificationPermission, checkExpiringSoon } from '../services/notifications';
import {
  getCurrentAuthUser,
  logoutAuthSession,
  isCloudSyncConfigured,
  type AuthUser,
} from '../services/cloudSyncAuth';

export default function SettingsPage() {
  const [notifStatus, setNotifStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
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

  async function handleEnableNotifications() {
    const permission = await requestNotificationPermission();
    setNotifStatus(permission);
    if (permission === 'granted') {
      await checkExpiringSoon();
    }
  }

  async function handleLogout() {
    setBusy(true);
    setStatusMsg('');
    try {
      await logoutAuthSession();
      setAuthUser(null);
      setStatusMsg('Signed out. You can sign in again from the landing screen.');
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
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Primary storage in Cloudflare KV; IndexedDB is used for offline cache
            </div>
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
            <div style={{ display: 'grid', gap: 8 }}>
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
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Foodie \u2014 Grocery Checking/Management that is painless
      </div>
    </div>
  );
}
