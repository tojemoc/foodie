import { useState } from 'react';
import { requestNotificationPermission, checkExpiringSoon } from '../services/notifications';

export default function SettingsPage() {
  const [notifStatus, setNotifStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  );

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
    if (granted) {
      await checkExpiringSoon();
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ Settings</h1>
      </div>

      <div className="card">
        <div className="settings-item">
          <div>
            <div style={{ fontWeight: 600 }}>Notifications</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {notifStatus === 'granted' && 'Enabled'}
              {notifStatus === 'denied' && 'Denied — enable in browser settings'}
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
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>0.1.0 — PoC</div>
          </div>
        </div>

        <div className="settings-item">
          <div>
            <div style={{ fontWeight: 600 }}>Data</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stored locally in IndexedDB</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Foodie — Grocery Checking/Management that is painless
      </div>
    </div>
  );
}
