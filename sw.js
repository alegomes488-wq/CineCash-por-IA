// CYBERCORE IA: Service Worker Premium
const CACHE_NAME = 'cinecash-v1.1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('[SW] CyberCore Ativado');
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Listener para notificações push (Bônus, Manutenção, Novidades)
self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body || 'Novas oportunidades de lucro detectadas pela Nexus!',
                icon: '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png',
                vibrate: [200, 100, 200],
                tag: data.tag || 'cinecash-notif',
                renotify: true,
                data: {
                    url: data.url || '/'
                }
            };

            event.waitUntil(
                self.registration.showNotification(data.title || 'CineCash IA', options)
            );
        } catch (e) {
            console.error('Erro ao processar Push Data:', e);
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});