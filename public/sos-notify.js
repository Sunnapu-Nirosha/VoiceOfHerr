// SOS In-App Notification Banner
// Checks for active SOS alerts and displays a banner on every page

(function() {
  var BASE_URL = (function() {
    if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://localhost:3001/api';
    }
    return 'https://voiceofher.onrender.com/api';
  })();

  function timeAgo(dateStr) {
    var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return diff + ' seconds ago';
    if (diff < 3600) return Math.floor(diff / 60) + ' minutes ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
    return Math.floor(diff / 86400) + ' days ago';
  }

  function createBanner(alert) {
    var locationUrl = (alert.location && alert.location.latitude && alert.location.longitude)
      ? 'https://maps.google.com/?q=' + alert.location.latitude + ',' + alert.location.longitude
      : null;

    var banner = document.createElement('div');
    banner.className = 'sos-alert-banner';
    banner.innerHTML = ''
      + '<div class="sos-alert-content">'
      +   '<div class="sos-alert-icon">&#128680;</div>'
      +   '<div class="sos-alert-text">'
      +     '<strong>EMERGENCY SOS</strong>'
      +     '<span>' + (alert.userName || 'Someone') + ' needs help!'
      +     (alert.emergencyType && alert.emergencyType !== 'other' ? ' (' + alert.emergencyType + ')' : '')
      +     ' - ' + timeAgo(alert.createdAt) + '</span>'
      +   '</div>'
      +   '<div class="sos-alert-actions">'
      +     (locationUrl ? '<a href="' + locationUrl + '" target="_blank" class="sos-alert-btn sos-location-btn">View Location</a>' : '')
      +     '<a href="tel:' + alert.userPhone + '" class="sos-alert-btn sos-call-btn">Call ' + alert.userPhone + '</a>'
      +     '<button class="sos-alert-btn sos-dismiss-btn" onclick="this.closest(\'.sos-alert-banner\').remove()">Dismiss</button>'
      +   '</div>'
      + '</div>';

    // Add styles if not already present
    if (!document.getElementById('sos-banner-styles')) {
      var style = document.createElement('style');
      style.id = 'sos-banner-styles';
      style.textContent = ''
        + '.sos-alert-banner{position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#ff4757,#ff3742);color:#fff;padding:12px 20px;box-shadow:0 4px 20px rgba(255,71,87,0.4);animation:sos-pulse 2s infinite}'
        + '.sos-alert-content{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:12px;flex-wrap:wrap}'
        + '.sos-alert-icon{font-size:32px;animation:sos-blink 1s infinite}'
        + '.sos-alert-text{flex:1;min-width:200px}'
        + '.sos-alert-text strong{display:block;font-size:14px;letter-spacing:1px}'
        + '.sos-alert-text span{font-size:13px;opacity:0.95}'
        + '.sos-alert-actions{display:flex;gap:8px;flex-wrap:wrap}'
        + '.sos-alert-btn{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:bold;text-decoration:none;cursor:pointer;border:none;transition:transform 0.2s}'
        + '.sos-alert-btn:hover{transform:scale(1.05)}'
        + '.sos-location-btn{background:#fff;color:#ff4757}'
        + '.sos-call-btn{background:#2ed573;color:#fff}'
        + '.sos-dismiss-btn{background:rgba(255,255,255,0.2);color:#fff}'
        + '@keyframes sos-pulse{0%,100%{opacity:1}50%{opacity:0.95}}'
        + '@keyframes sos-blink{0%,100%{opacity:1}50%{opacity:0.5}}';
      document.head.appendChild(style);
    }

    return banner;
  }

  async function checkForAlerts() {
    try {
      var res = await fetch(BASE_URL + '/sos/active');
      if (!res.ok) return;
      var data = await res.json();

      if (data.alerts && data.alerts.length > 0) {
        // Remove existing banners
        var existing = document.querySelectorAll('.sos-alert-banner');
        existing.forEach(function(el) { el.remove(); });

        // Add new banners
        data.alerts.forEach(function(alert) {
          var banner = createBanner(alert);
          document.body.insertBefore(banner, document.body.firstChild);
        });
      }
    } catch (e) {
      console.log('SOS notification check failed:', e.message);
    }
  }

  // Check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkForAlerts);
  } else {
    checkForAlerts();
  }

  // Check every 30 seconds
  setInterval(checkForAlerts, 30000);
})();
