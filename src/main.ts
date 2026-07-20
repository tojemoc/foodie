import { loadSession, saveSession, clearSession, getSession } from './auth/session.js';
import { syncOnOpen }                from './cards/sync.js';
import { loadFromLocalStorage, getCards } from './cards/store.js';
import {
  showPanel, showAuthScreen, handleRegister,
  handleLogin, handleMagicSend, handleMagicVerify,
} from './ui/auth.js';
import {
  renderCards, filterByCategory, openDetail,
  openAddSheet, openEditSheet, saveCard, deleteCurrentCard,
  handleNumberInput, nextWizardStep, prevWizardStep, applyFreshTemplate, buildPlacementChips,
  exportCards, importCards, openSheet, closeSheet,
  closeOnBackdrop, showPage, toggleSearch,
} from './ui/cards.js';
import { showToast }                from './ui/toast.js';
import { notifyExpiring }            from './notifications/expiry.js';
import { enableWebPush, reconcileWebPush, isPushSupported, isIosSafari, isStandaloneDisplay } from './notifications/push.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  buildPlacementChips();
  loadFromLocalStorage();

  showStandaloneAuthHint();

  // 1. Check for ?magic= token first
  const magicResult = await handleMagicVerify();
  if (magicResult) {
    saveSession(magicResult);
    await bootMainApp();
    return;
  }

  // 2. Restore existing session
  const session = loadSession();
  if (session) {
    await bootMainApp();
    return;
  }

  // 3. No session — show auth
  showAuthScreen();
  showPanel('login');
}

async function bootMainApp(): Promise<void> {
  const session = getSession();
  if (!session) { showAuthScreen(); return; }

  // Update user UI
  const initials = session.username.slice(0, 2).toUpperCase();
  setText('user-avatar-mini', initials);
  setText('user-name-mini',   session.username);
  setText('account-avatar',   initials);
  setText('account-name',     session.username);

  // Stamp the version into the About row
  setText('app-version', `v${__APP_VERSION__}`);

  document.getElementById('auth-screen')!.style.display    = 'none';
  document.getElementById('magic-verifying')!.style.display = 'none';
  document.getElementById('main-app')!.style.display        = 'flex';

  renderCards();
  notifyExpiring(getCards());
  await syncOnOpen();
  void reconcileWebPush();
}

// ── Global event wiring ───────────────────────────────────────────────────────
// Attaching handlers here keeps the UI modules free of direct DOM event binding.

function wire(): void {
  // Auth panels
  on('login-btn',        'click', async () => {
    const r = await handleLogin();
    if (r) { saveSession(r); await bootMainApp(); }
  });
  on('register-btn',     'click', async () => {
    const r = await handleRegister();
    if (r) { saveSession(r); await bootMainApp(); }
  });
  on('magic-btn',        'click', () => handleMagicSend());
  on('show-register',    'click', () => showPanel('register'));
  on('show-login',       'click', () => showPanel('login'));
  on('show-magic-login', 'click', () => showPanel('magic'));
  on('show-magic-login-2','click',() => showPanel('magic'));
  on('back-to-login',    'click', () => showPanel('login'));
  on('back-to-login-2',  'click', () => showPanel('login'));

  // Magic email — submit on Enter
  on('magic-email', 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') handleMagicSend();
  });
  on('reg-email', 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      document.getElementById('register-btn')?.click();
    }
  });

  // Account / sign out
  on('user-pill',    'click', () => openSheet('account-overlay'));
  on('account-avatar','click',() => openSheet('account-overlay'));
  on('sign-out-btn', 'click', () => {
    if (!confirm('Sign out?')) return;
    clearSession();
    showAuthScreen();
    showPanel('login');
  });

  // Logo — always goes home
  on('logo', 'click', () => showPage('home'));
  on('settings-btn', 'click', () => {
    const settingsPage = document.getElementById('page-settings');
    const isActive = settingsPage?.classList.contains('active');
    showPage(isActive ? 'home' : 'settings');
  });

  // Search
  on('search-btn',   'click', () => toggleSearch());
  on('search-input', 'input', () => renderCards());

  // Sync now button in settings
  on('manual-sync-settings', 'click', async () => {
    await syncOnOpen();
    showToast('Sync complete ✓');
  });

  // FAB + sheets
  on('fab-add', 'click', () => openAddSheet());

  // Backdrop close
  on('detail-overlay',  'click', e => closeOnBackdrop(e as MouseEvent, 'detail-overlay'));
  on('add-overlay',     'click', e => closeOnBackdrop(e as MouseEvent, 'add-overlay'));
  on('account-overlay', 'click', e => closeOnBackdrop(e as MouseEvent, 'account-overlay'));

  // Sheet close buttons
  document.querySelectorAll<HTMLElement>('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset['closeSheet'];
      if (target) closeSheet(target);
    });
  });

  // Add form
  on('f-number', 'input',  () => handleNumberInput());
  on('f-template', 'change', () => applyFreshTemplate());
  on('wizard-next-btn', 'click', () => nextWizardStep());
  on('wizard-back-btn', 'click', () => prevWizardStep());
  on('save-card-btn',    'click', () => saveCard());
  on('edit-card-btn',    'click', () => openEditSheet());
  on('delete-card-btn',  'click', () => deleteCurrentCard());

  on('enable-expiry-notifications', 'click', () => void enableExpiryAlerts());

  // Settings
  on('export-btn',  'click', () => exportCards());
  on('import-input','change', e => importCards(e));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function on(id: string, event: string, handler: (e: Event) => void): void {
  document.getElementById(id)?.addEventListener(event, handler);
}

function setText(id: string, val: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/** iOS / Safari: home-screen web apps use separate storage from the browser tab — log in inside the app you use. */
function showStandaloneAuthHint(): void {
  const el = document.getElementById('auth-pwa-hint');
  if (!el) return;
  const standalone =
    (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false) ||
    // iOS Safari home-screen
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  el.style.display = standalone ? 'block' : 'none';
}

async function enableExpiryAlerts(): Promise<void> {
  // Prefer Web Push (background). Falls back to in-page Notification when push is unavailable.
  if (isPushSupported() || (isIosSafari() && !isStandaloneDisplay())) {
    const result = await enableWebPush();
    if (result.ok) {
      notifyExpiring(getCards());
      showToast('Background expiry alerts enabled ✓');
      return;
    }
    if (result.reason.includes('Home Screen') || result.reason.includes('not supported') || result.reason.includes('not configured')) {
      showToast(result.reason);
      // Still try foreground notifications if permission can be granted.
      if (!isPushSupported()) {
        requestForegroundNotificationPermission();
      }
      return;
    }
    showToast(result.reason);
    return;
  }

  requestForegroundNotificationPermission();
}

function requestForegroundNotificationPermission(): void {
  if (typeof Notification === 'undefined') {
    showToast('Notifications are not supported in this browser');
    return;
  }
  const finish = (p: NotificationPermission) => {
    if (p === 'granted') {
      notifyExpiring(getCards());
      showToast('Expiry alerts enabled — reminders appear when you open Foodie');
    } else if (p === 'denied') {
      showToast('Notifications blocked — you can enable them in system settings');
    } else {
      showToast('Expiry alerts stay off until you allow notifications');
    }
  };

  if (Notification.permission === 'granted') {
    notifyExpiring(getCards());
    showToast('Checking expiry reminders…');
    return;
  }

  void Notification.requestPermission().then(finish);
}

// ── Run ───────────────────────────────────────────────────────────────────────

wire();
init();

// ── Background sync ───────────────────────────────────────────────────────────
// Re-sync whenever the user switches back to the tab/app. This is the main
// mechanism that makes "open on mobile and see desktop changes" work without
// manually tapping Sync.

let _lastSync = 0;
const MIN_SYNC_INTERVAL_MS = 10_000; // don't hammer the API if user tab-switches rapidly

function syncIfSession(): void {
  const session = getSession();
  if (!session) return;
  const now = Date.now();
  if (now - _lastSync < MIN_SYNC_INTERVAL_MS) return;
  _lastSync = now;
  syncOnOpen();
}

// Page becomes visible again (tab switch, app resume on mobile)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  syncIfSession();
  if (getSession()) notifyExpiring(getCards());
});

// Device comes back online after being offline
window.addEventListener('online', () => syncIfSession());

