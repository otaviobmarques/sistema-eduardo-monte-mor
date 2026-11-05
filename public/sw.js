/* Service worker do Sistema de OS – Auto Visão: Web Push e abertura do link ao tocar. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: event.data && event.data.text() }; }
  const titulo = d.titulo || 'Sistema de OS – Auto Visão';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, renotify: true,
    requireInteraction: !!d.urgente, data: { link: d.link || '/' }, lang: 'pt-BR',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abas) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
