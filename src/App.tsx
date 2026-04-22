import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import AddItemPage from './pages/AddItemPage';
import LocationsPage from './pages/LocationsPage';
import SettingsPage from './pages/SettingsPage';
import AuthLandingPage from './pages/AuthLandingPage';
import { seedDefaultLocations } from './services/db';
import { checkExpiringSoon } from './services/notifications';
import {
  getCurrentAuthUser,
  isCloudSyncConfigured,
  pullCloudSnapshotToLocal,
  pushLocalSnapshotToCloud,
  type AuthUser,
} from './services/cloudSyncAuth';

function App() {
  const [ready, setReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const cloudConfigured = isCloudSyncConfigured();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedDefaultLocations();
        if ('Notification' in window && Notification.permission === 'granted') {
          await checkExpiringSoon();
        }
      } catch (err) {
        console.error('Startup initialization failed:', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cloudConfigured) {
        if (!cancelled) {
          setAuthResolved(true);
        }
        return;
      }
      try {
        const user = await getCurrentAuthUser();
        if (!cancelled) {
          setAuthUser(user);
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudConfigured]);

  useEffect(() => {
    if (!cloudConfigured || !authUser) {
      return;
    }

    let syncing = false;
    const syncNow = async (reason: 'login' | 'focus' | 'visibility') => {
      if (syncing) return;
      syncing = true;
      try {
        const pulled = await pullCloudSnapshotToLocal();
        if (!pulled) {
          const pushed = await pushLocalSnapshotToCloud();
          setAuthMessage(`Cloud sync initialized from this device (${pushed.itemCount} items).`);
          return;
        }
        setAuthMessage(`Cloud sync updated on ${reason} (${pulled.itemCount} items).`);
      } catch (err) {
        console.error('Cloud sync failed:', err);
        setAuthMessage(
          err instanceof Error ? `Cloud sync failed: ${err.message}` : 'Cloud sync failed.',
        );
      } finally {
        syncing = false;
      }
    };

    void syncNow('login');

    const onFocus = () => { void syncNow('focus'); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncNow('visibility');
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authUser, cloudConfigured]);

  if (!ready || !authResolved) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (cloudConfigured && !authUser) {
    return (
      <AuthLandingPage
        onAuthenticated={(user) => {
          setAuthUser(user);
          setAuthMessage(`Signed in as ${user.email}.`);
        }}
        cloudConfigured={cloudConfigured}
      />
    );
  }

  return (
    <BrowserRouter>
      <div className="app">
        {authMessage && (
          <div className="status-banner info" style={{ margin: '8px 16px 0 16px' }}>
            {authMessage}
          </div>
        )}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
