// Check if user is logged in
if (!window.isLoggedIn()) {
  window.location.href = 'login.html';
}

const sosBtn = document.getElementById('sos-btn');
const alertStatus = document.getElementById('alert-status');
const locationStatus = document.getElementById('location-status');
const contactsList = document.getElementById('contacts-list');

function showAlert(message, type) {
  alertStatus.textContent = message;
  alertStatus.className = 'alert-status alert-' + type;
  alertStatus.style.display = 'block';
  setTimeout(function() { alertStatus.style.display = 'none'; }, 5000);
}

function updateLocationStatus(message, isError) {
  locationStatus.textContent = message;
  locationStatus.style.color = isError ? '#ff6b6b' : '#51cf66';
}

function formatPhoneNumber(phone) {
  if (phone.startsWith('+')) return phone;
  if (/^[6-9]\d{9}$/.test(phone)) return '+91' + phone;
  return phone;
}

function renderContacts(contacts) {
  if (!contacts || contacts.length === 0) {
    contactsList.innerHTML = '<div class="no-contacts">No emergency contacts found.<br>Please add emergency contacts to receive help during emergencies.</div>';
    return;
  }
  contactsList.innerHTML = contacts.map(function(contact) {
    return '<div class="phone-number" onclick="window.location.href=\'tel:' + formatPhoneNumber(contact.phone) + '\'">' +
      '<div>' +
        '<div class="contact-name">' + (contact.name || 'Emergency Contact') + '</div>' +
        '<div>' + formatPhoneNumber(contact.phone) + '</div>' +
        (contact.relationship ? '<div style="font-size: 12px; opacity: 0.8;">' + contact.relationship + '</div>' : '') +
      '</div>' +
      '<div style="font-size: 24px;">&#128222;</div>' +
    '</div>';
  }).join('');
}

async function loadEmergencyContacts() {
  try {
    var contacts = await window.getEmergencyContacts();
    renderContacts(contacts);
  } catch (error) {
    console.error('Failed to load emergency contacts:', error);
    contactsList.innerHTML = '<div class="no-contacts">Failed to load emergency contacts. Please try again.</div>';
  }
}

async function checkLocation() {
  try {
    updateLocationStatus('Checking location access...');
    await window.getCurrentLocation();
    updateLocationStatus('Location access granted');
  } catch (error) {
    console.error('Location error:', error);
    updateLocationStatus('Location access denied. SOS may not work properly.', true);
  }
}

sosBtn.addEventListener('click', async function() {
  if (sosBtn.classList.contains('sending')) return;

  sosBtn.classList.add('sending');
  sosBtn.innerHTML = '<span style="font-size: 48px;">&#9203;</span><span style="font-size: 16px; margin-top: 10px;">SENDING...</span>';

  try {
    if (!window.isLoggedIn()) throw new Error('User not logged in');

    updateLocationStatus('Getting your location...');
    var location = await window.getCurrentLocation();

    updateLocationStatus('Sending SOS alert...');
    var response = await window.sendSOSAlert('Emergency SOS alert', 'other');

    var notificationMessage = 'SOS alert sent successfully! All users have been notified.';
    if (response.notifications) {
      var sent = response.notifications.filter(function(n) { return n.status === 'sent'; });
      var logged = response.notifications.filter(function(n) { return n.status === 'logged'; });
      var failed = response.notifications.filter(function(n) { return n.status === 'failed'; });

      notificationMessage = 'SOS alert sent successfully!';
      if (sent.length > 0) notificationMessage += ' ' + sent.length + ' user(s) notified via SMS/FCM.';
      if (logged.length > 0) notificationMessage += ' ' + logged.length + ' user(s) logged for notification.';
      if (failed.length > 0) notificationMessage += ' ' + failed.length + ' user(s) failed.';
    }

    showAlert(notificationMessage, 'success');
    updateLocationStatus('SOS sent successfully!');

  } catch (error) {
    console.error('SOS alert failed:', error);
    var errorMessage = 'Failed to send SOS alert. Please try again.';
    if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (error.message.includes('User not logged in')) {
      errorMessage = 'Please log in to send SOS alerts.';
    } else if (error.message.includes('location')) {
      errorMessage = 'Location access denied. Please enable location services.';
    }
    showAlert(errorMessage, 'error');
    updateLocationStatus('SOS failed. Please try again.', true);
  } finally {
    sosBtn.classList.remove('sending');
    sosBtn.innerHTML = '<span style="font-size: 48px;">&#128680;</span><span style="font-size: 16px; margin-top: 10px;">SEND SOS</span>';
  }
});

document.addEventListener('DOMContentLoaded', async function() {
  await checkLocation();
  await loadEmergencyContacts();

  // Initialize FCM for push notifications
  if (typeof initializeFCM === 'function') {
    try {
      await initializeFCM();
      console.log('FCM initialized for push notifications');
    } catch (e) {
      console.warn('FCM initialization skipped:', e);
    }
  }
});
