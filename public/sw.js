// File: public/sw.js

self.addEventListener('push', event => {
    // Coba ambil data push, jika tidak ada, gunakan default
    let data;
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'Notifikasi Baru',
        body: 'Ada pembaruan untuk Anda.',
      };
    }
  
    const title = data.title || 'Transaksi Baru';
    const options = {
      body: data.body,
      icon: '/logo_192x192.png', // Ikon yang muncul di dalam notifikasi
      badge: '/logo_192x192.png' // Ikon kecil di status bar (untuk Android)
    };
  
    // Tampilkan notifikasi
    event.waitUntil(self.registration.showNotification(title, options));
  });
  
  // Event ini diperlukan agar service worker langsung aktif
  self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
  });
  
  self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
  });
  