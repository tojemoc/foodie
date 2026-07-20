/**
 * Service worker push handlers for Foodie (imported by Workbox via importScripts).
 * Simplified from tojemoc/vmp packages/web/sw-push.js — expiry reminders only.
 */
'use strict';

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

sw.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title
    : 'Foodie';
  const body = typeof data.body === 'string' ? data.body : '';

  let targetUrl = '/';
  if (typeof data.url === 'string') {
    if (data.url.startsWith('/')) {
      targetUrl = data.url;
    } else {
      try {
        const url = new URL(data.url);
        if (url.origin === sw.location.origin) targetUrl = data.url;
      } catch {
        // keep default
      }
    }
  }

  const tag = typeof data.tag === 'string' ? data.tag : 'foodie-expiry';

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      data: { url: targetUrl },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification?.data;
  const targetUrl = (notifData && typeof notifData.url === 'string') ? notifData.url : '/';

  event.waitUntil((async () => {
    let targetPath = '/';
    let targetFullUrl = targetUrl;
    try {
      const parsed = new URL(targetUrl, sw.location.origin);
      targetPath = parsed.pathname;
      targetFullUrl = parsed.href;
    } catch {
      targetPath = targetUrl;
    }

    const clientList = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      try {
        const currentUrl = new URL(client.url);
        if (currentUrl.pathname === targetPath) {
          await client.focus();
          return;
        }
      } catch {
        // ignore
      }
    }

    await sw.clients.openWindow(targetFullUrl);
  })());
});
