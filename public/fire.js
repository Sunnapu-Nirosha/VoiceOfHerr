// Backend API configuration
// Auto-detect backend base URL
const API_BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:3000/api"
  : "https://voiceofher.onrender.com/api";


// Utility functions
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function setCookie(name, value, days = 7) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function removeCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// API request helper
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Authentication functions
async function registerUser(aadhar, password, phone, name = '', email = '') {
  try {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        aadhar,
        password,
        phone,
        name,
        email
      })
    });

    // Store token and user info
    localStorage.setItem('authToken', response.token);
    localStorage.setItem('userId', response.user._id);
    setCookie('userId', response.user._id);

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

async function loginUser(aadhar, password) {
  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        aadhar,
        password
      })
    });

    // Store token and user info
    localStorage.setItem('authToken', response.token);
    localStorage.setItem('userId', response.user._id);
    setCookie('userId', response.user._id);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  removeCookie('userId');
  window.location.href = 'login.html';
}

function isLoggedIn() {
  return localStorage.getItem('authToken') !== null;
}

function getCurrentUser() {
  const userId = localStorage.getItem('userId');
  return userId ? { id: userId } : null;
}

// SOS Alert functions
async function createSOSAlert(latitude, longitude, address = '', description = '', emergencyType = 'other') {
  try {
    const response = await apiRequest('/sos/create', {
      method: 'POST',
      body: JSON.stringify({
        latitude,
        longitude,
        address,
        description,
        emergencyType
      })
    });

    return response;
  } catch (error) {
    console.error('SOS creation error:', error);
    throw error;
  }
}

async function getActiveAlerts() {
  try {
    const response = await apiRequest('/sos/active');
    return response.alerts;
  } catch (error) {
    console.error('Get active alerts error:', error);
    throw error;
  }
}

async function getUserAlerts() {
  try {
    const response = await apiRequest('/sos/my-alerts');
    return response.alerts;
  } catch (error) {
    console.error('Get user alerts error:', error);
    throw error;
  }
}

async function updateAlertStatus(alertId, status) {
  try {
    const response = await apiRequest(`/sos/${alertId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    return response;
  } catch (error) {
    console.error('Update alert status error:', error);
    throw error;
  }
}

// User profile functions
async function getUserProfile() {
  try {
    const response = await apiRequest('/auth/profile');
    return response.user;
  } catch (error) {
    console.error('Get profile error:', error);
    throw error;
  }
}

async function updateUserProfile(profileData) {
  try {
    const response = await apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });

    return response;
  } catch (error) {
    console.error('Update profile error:', error);
    throw error;
  }
}

async function addEmergencyContact(name, phone, relationship = '') {
  try {
    const response = await apiRequest('/users/emergency-contacts', {
      method: 'POST',
      body: JSON.stringify({
        name,
        phone,
        relationship
      })
    });

    return response;
  } catch (error) {
    console.error('Add emergency contact error:', error);
    throw error;
  }
}

async function getEmergencyContacts() {
  try {
    const response = await apiRequest('/users/emergency-contacts');
    return response.contacts;
  } catch (error) {
    console.error('Get emergency contacts error:', error);
    throw error;
  }
}

async function deleteEmergencyContact(contactId) {
  try {
    const response = await apiRequest(`/users/emergency-contacts/${contactId}`, {
      method: 'DELETE'
    });

    return response;
  } catch (error) {
    console.error('Delete emergency contact error:', error);
    throw error;
  }
}

// Phone number functions (for backward compatibility)
function getPhoneNumbers() {
  // This function is used in the existing SOS page
  // For now, return emergency contacts from localStorage or make API call
  const contacts = localStorage.getItem('emergencyContacts');
  if (contacts) {
    return JSON.parse(contacts).map(contact => contact.phone).join('|');
  }
  return null;
}

async function getAllUsersNumbers(userId) {
  try {
    // Get current user's emergency contacts
    const contacts = await getEmergencyContacts();
    const phoneNumbers = contacts.map(contact => contact.phone).join('|');
    localStorage.setItem('emergencyContacts', JSON.stringify(contacts));
    return phoneNumbers;
  } catch (error) {
    console.error('Get all users numbers error:', error);
    return null;
  }
}

// Location functions
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    console.log('Requesting location with high accuracy...');

    // First try with high accuracy and shorter timeout
    const tryHighAccuracy = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
          console.log('Location obtained with high accuracy:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy + ' meters',
          timestamp: new Date(position.timestamp).toLocaleString()
        });

          // Accept location even with poor accuracy for emergency situations
          if (position.coords.accuracy > 1000) {
            console.log('Location obtained (accuracy: ' + position.coords.accuracy + ' meters) - acceptable for emergency use');
        }

        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
          console.error('High accuracy geolocation failed:', error);
          
          // If high accuracy fails, try with lower accuracy
          if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
            console.log('Trying with lower accuracy settings...');
            tryLowAccuracy();
          } else {
            handleGeolocationError(error, reject);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // 15 seconds for high accuracy
          maximumAge: 60000 // Accept cached location up to 1 minute old
        }
      );
    };

    // Fallback to lower accuracy
    const tryLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Location obtained with lower accuracy (acceptable for emergency use):', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy + ' meters',
            timestamp: new Date(position.timestamp).toLocaleString()
          });

          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.error('Low accuracy geolocation also failed:', error);
          handleGeolocationError(error, reject);
        },
        {
          enableHighAccuracy: false,
          timeout: 20000, // 20 seconds for low accuracy
          maximumAge: 300000 // Accept cached location up to 5 minutes old
        }
      );
    };

    // Handle geolocation errors
    const handleGeolocationError = (error, reject) => {
        let errorMessage = 'Failed to get location';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
          errorMessage = 'Location permission denied. Please enable location access in your browser settings and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable. Please check your GPS settings and ensure you have a good signal.';
            break;
          case error.TIMEOUT:
          errorMessage = 'Location request timed out. Please check your internet connection and GPS signal, then try again.';
            break;
          default:
          errorMessage = 'An unknown error occurred while getting location. Please try again.';
        }
        
        reject(new Error(errorMessage));
    };

    // Start with high accuracy attempt
    tryHighAccuracy();
  });
}

// Get address from coordinates using reverse geocoding
async function getAddressFromCoordinates(latitude, longitude) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get address');
    }
    
    const data = await response.json();
    return data.display_name || 'Address not available';
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return 'Address not available';
  }
}

// SOS Alert helper function
async function sendSOSAlert(description = '', emergencyType = 'other') {
  try {
    // Get current location with retry logic
    let location;
    let locationAttempts = 0;
    const maxLocationAttempts = 2;
    
    while (locationAttempts < maxLocationAttempts) {
      try {
        location = await getCurrentLocation();
        break; // Success, exit the retry loop
      } catch (error) {
        locationAttempts++;
        console.warn(`Location attempt ${locationAttempts} failed:`, error.message);
        
        if (locationAttempts >= maxLocationAttempts) {
          // If we can't get location, still send SOS with approximate location
          console.warn('All location attempts failed, sending SOS without precise location');
          location = {
            latitude: 0,
            longitude: 0,
            accuracy: 999999
          };
        } else {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Get address from coordinates (only if we have valid coordinates)
    let address = 'Location not available';
    if (location.latitude !== 0 && location.longitude !== 0) {
      try {
        address = await getAddressFromCoordinates(location.latitude, location.longitude);
      } catch (error) {
        console.warn('Failed to get address, using coordinates only:', error);
        address = `Coordinates: ${location.latitude}, ${location.longitude}`;
      }
    }
    
    console.log('Sending SOS with location:', {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy + ' meters',
      address: address
    });
    
    // Create SOS alert
    const response = await createSOSAlert(
      location.latitude,
      location.longitude,
      address,
      description,
      emergencyType
    );

    // Notifications are now handled automatically during SOS creation
    if (response.notifications) {
      const successfulNotifications = response.notifications.filter(n => n.status === 'sent');
      const failedNotifications = response.notifications.filter(n => n.status === 'failed');
      const loggedNotifications = response.notifications.filter(n => n.status === 'logged');
      
      console.log(`Notifications: ${successfulNotifications.length} sent, ${failedNotifications.length} failed, ${loggedNotifications.length} logged for manual notification`);
    }

    return response;
  } catch (error) {
    console.error('Send SOS alert error:', error);
    throw error;
  }
}

// Initialize app
function initializeApp() {
  // Check if user is logged in
  if (!isLoggedIn()) {
    // Redirect to login if not on login or register page
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'login.html' && currentPage !== 'Register.html' && currentPage !== 'index.html') {
      window.location.href = 'login.html';
    }
  }

  // Add logout functionality to protected pages
  const logoutButtons = document.querySelectorAll('.logout-btn');
  logoutButtons.forEach(button => {
    button.addEventListener('click', logout);
  });

  // Add SOS button functionality
  const sosButtons = document.querySelectorAll('.sos-btn');
  sosButtons.forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await sendSOSAlert();
        alert('SOS alert sent successfully! Emergency contacts have been notified.');
      } catch (error) {
        alert('Failed to send SOS alert. Please try again.');
        console.error('SOS button error:', error);
      }
    });
  });
}

// Make functions available globally for non-module usage
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logout = logout;
window.isLoggedIn = isLoggedIn;
window.getCurrentUser = getCurrentUser;
window.createSOSAlert = createSOSAlert;
window.getActiveAlerts = getActiveAlerts;
window.getUserAlerts = getUserAlerts;
window.updateAlertStatus = updateAlertStatus;
window.getUserProfile = getUserProfile;
window.updateUserProfile = updateUserProfile;
window.addEmergencyContact = addEmergencyContact;
window.getEmergencyContacts = getEmergencyContacts;
window.deleteEmergencyContact = deleteEmergencyContact;
window.getPhoneNumbers = getPhoneNumbers;
window.getAllUsersNumbers = getAllUsersNumbers;
window.getCurrentLocation = getCurrentLocation;
window.getAddressFromCoordinates = getAddressFromCoordinates;
window.sendSOSAlert = sendSOSAlert;
window.initializeApp = initializeApp;

// Debug function to check emergency contacts
window.debugEmergencyContacts = async function() {
  try {
    const response = await apiRequest('/sos/test/emergency-contacts');
    console.log('Emergency contacts debug info:', response);
    return response;
  } catch (error) {
    console.error('Debug emergency contacts error:', error);
    return null;
  }
};

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp); 