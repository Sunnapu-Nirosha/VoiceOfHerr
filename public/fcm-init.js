// Firebase Cloud Messaging - Frontend Initialization
// Config is auto-loaded from server - no manual editing needed here

let firebaseMessaging = null;
let firebaseConfig = null;

// Fetch Firebase config from server
async function fetchFirebaseConfig() {
  try {
    const response = await fetch(BASE_URL + '/firebase-config');
    if (!response.ok) throw new Error('Failed to fetch Firebase config');
    const config = await response.json();
    if (!config.apiKey || config.apiKey === 'YOUR_API_KEY') {
      console.warn('Firebase web config not configured in firebase-web-config.js');
      return null;
    }
    return config;
  } catch (error) {
    console.error('Error fetching Firebase config:', error);
    return null;
  }
}

async function initializeFCM() {
  try {
    // Load Firebase SDK from CDN if not already loaded
    if (typeof firebase === 'undefined') {
      await new Promise(function(resolve, reject) {
        var script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
        script1.onload = function() {
          var script2 = document.createElement('script');
          script2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js';
          script2.onload = resolve;
          script2.onerror = reject;
          document.head.appendChild(script2);
        };
        script1.onerror = reject;
        document.head.appendChild(script1);
      });
    }

    // Fetch config from server
    firebaseConfig = await fetchFirebaseConfig();
    if (!firebaseConfig) {
      console.warn('Firebase config not available. Push notifications disabled.');
      return null;
    }

    // Initialize Firebase if not already initialized
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    firebaseMessaging = firebase.messaging();

    // Request notification permission and get token
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    // Get FCM token
    var tokenOptions = {};
    if (firebaseConfig.vapidKey && firebaseConfig.vapidKey !== 'YOUR_VAPID_KEY') {
      tokenOptions.vapidKey = firebaseConfig.vapidKey;
    }
    const token = await firebaseMessaging.getToken(tokenOptions);

    console.log('FCM Token obtained:', token);

    // Save token to backend
    await saveFCMToken(token);

    // Listen for token refresh
    firebaseMessaging.onTokenRefresh(async function() {
      try {
        const newToken = await firebaseMessaging.getToken();
        console.log('FCM Token refreshed:', newToken);
        await saveFCMToken(newToken);
      } catch (err) {
        console.error('Error refreshing FCM token:', err);
      }
    });

    // Handle foreground messages
    firebaseMessaging.onMessage(function(payload) {
      console.log('Foreground message received:', payload);
      showForegroundNotification(payload);
    });

    return token;
  } catch (error) {
    console.error('FCM initialization error:', error);
    return null;
  }
}

async function saveFCMToken(token) {
  try {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
      console.warn('No auth token found. Cannot save FCM token.');
      return;
    }

    const response = await fetch(BASE_URL + '/fcm/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ fcmToken: token })
    });

    if (response.ok) {
      console.log('FCM token saved to server');
    } else {
      console.warn('Failed to save FCM token to server');
    }
  } catch (error) {
    console.error('Error saving FCM token:', error);
  }
}

function showForegroundNotification(payload) {
  const notification = payload.notification || {};
  const data = payload.data || {};

  // Create notification banner in the page
  const banner = document.createElement('div');
  banner.id = 'fcm-notification-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#ff4757,#ff3742);color:white;padding:15px 20px;box-shadow:0 4px 15px rgba(0,0,0,0.3);animation:slideDown 0.3s ease;font-family:Arial,sans-serif;';

  var title = notification.title || 'EMERGENCY SOS ALERT';
  var body = notification.body || 'Someone needs help!';

  banner.innerHTML = '<div style="max-width:800px;margin:0 auto;">'
    + '<div style="display:flex;justify-content:space-between;align-items:start;">'
    + '<div>'
    + '<div style="font-size:16px;font-weight:bold;margin-bottom:5px;">' + title + '</div>'
    + '<div style="font-size:14px;opacity:0.9;">' + body + '</div>'
    + (data.userPhone ? '<div style="font-size:13px;margin-top:5px;opacity:0.8;">' + data.userPhone + '</div>' : '')
    + (data.location ? '<div style="font-size:13px;margin-top:3px;opacity:0.8;"><a href="' + data.location + '" target="_blank" style="color:white;text-decoration:underline;">View Location</a></div>' : '')
    + '</div>'
    + '<button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;padding:0 5px;">&times;</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(banner);

  // Also try native notification
  if (Notification.permission === 'granted') {
    try {
      var nativeNotif = new Notification(title, {
        body: body,
        icon: '/images/sos.svg',
        tag: 'sos-alert-foreground'
      });
      nativeNotif.onclick = function() {
        window.focus();
        window.location.href = '/sos.html';
      };
    } catch (e) {
      console.warn('Native notification failed:', e);
    }
  }

  // Auto-remove banner after 10 seconds
  setTimeout(function() {
    if (banner.parentElement) {
      banner.style.animation = 'slideUp 0.3s ease forwards';
      setTimeout(function() { banner.remove(); }, 300);
    }
  }, 10000);
}

// Add CSS animations for banner
(function() {
  var style = document.createElement('style');
  style.textContent = '@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}@keyframes slideUp{from{transform:translateY(0)}to{transform:translateY(-100%)}}';
  document.head.appendChild(style);
})();

// Remove FCM token on logout
async function removeFCMToken() {
  try {
    var authToken = localStorage.getItem('authToken');
    if (authToken) {
      await fetch(BASE_URL + '/fcm/token', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
    }
  } catch (e) {
    console.warn('Error removing FCM token:', e);
  }
}

// Make functions globally available
window.initializeFCM = initializeFCM;
window.removeFCMToken = removeFCMToken;
window.saveFCMToken = saveFCMToken;
