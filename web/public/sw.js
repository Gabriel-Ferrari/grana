// Avisos (Web Push): mostra a notificação e, no toque, abre o app na tela certa. Sem cache offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
    const m = e.data ? e.data.json() : {};
    e.waitUntil(
        self.registration.showNotification(m.title || 'grana', {
            body: m.body,
            tag: m.tag,
            icon: '/icon-192.png',
            lang: 'pt-BR',
            data: { url: m.url || '/' },
        }),
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
            const w = list.find((c) => c.url.startsWith(self.location.origin));
            if (w) {
                await w.focus();
                return w.navigate(url).catch(() => self.clients.openWindow(url));
            }
            return self.clients.openWindow(url);
        }),
    );
});
