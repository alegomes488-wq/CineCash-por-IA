// Service Worker limpo — desativa anúncios push da Monetag
// Este arquivo substitui o sw.js anterior que carregava anúncios em segundo plano

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Se desregistra imediatamente para limpar o SW antigo da Monetag
  event.waitUntil(self.registration.unregister())
})
