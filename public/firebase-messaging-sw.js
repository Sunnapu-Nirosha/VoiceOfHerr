// Firebase Cloud Messaging Service Worker
// Config is auto-loaded from server - no manual editing needed here

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Fetch config from server then initialize
self.addEventListener('install', function(event) {
  event.waitUntil(fetchConfigAndInit());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(fetchConfigAndInit());
});

var messagingInitialized = false;

async function fetchConfigAndInit() {
  if (messagingInitialized) return;

  try {
    // Determine the base URL from the service worker location
    var baseUrl = self.location.origin;

    var response = await fetch(baseUrl + '/api/firebase-config');
    if (!response.ok) throw new Error('Failed to fetch config');

    var config = await response.json();
    if (!config.apiKey || config.apiKey === 'YOUR_API_KEY') {
      console.warn('[SW] Firebase config not configured');
      return;
    }

    firebase.initializeApp(config);
    var messaging = firebase.messaging();
    messagingInitialized = true;

    // Handle background messages
    messaging.onBackgroundMessage(function(payload) {
      console.log('[SW] Background message received:', payload);

      var notificationTitle = (payload.notification && payload.notification.title) || 'EMERGENCY SOS ALERT';
      var notificationOptions = {
        body: (payload.notification && payload.notification.body) || 'Someone needs help!',
        icon: '/images/sos.svg',
        badge: '/images/sos.svg',
        tag: 'sos-alert',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: payload.data || {}
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });

    console.log('[SW] Firebase messaging initialized');
  } catch (error) {
    console.error('[SW] Firebase init error:', error);
  }
}

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/sos.html');
        }
      })
  );
});
