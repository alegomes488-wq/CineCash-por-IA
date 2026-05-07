// Service Worker CineCash IA (Versão Compat)
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAodV-dw-p0UP7pqneDZaowOZLRmw6GVBA",
    authDomain: "playearn-b001b.firebaseapp.com",
    databaseURL: "https://playearn-b001b-default-rtdb.firebaseio.com",
    projectId: "playearn-b001b",
    messagingSenderId: "563829659490"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Mensagem em background:', payload);
    const title = payload.notification?.title || "CineCash IA";
    const options = {
        body: payload.notification?.body || "Você tem uma nova atualização.",
        icon: '/bg.png',
        data: payload.data
    };
    self.registration.showNotification(title, options);
});

// Cache básico para funcionamento offline
const CACHE_NAME = 'cinecash-v4';
self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['./', './index.html', './style.css'])));
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
