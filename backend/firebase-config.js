const admin = require('firebase-admin');

// ========================================
// FIREBASE CONFIGURATION
// ========================================
// Option 1: Using service account key file (RECOMMENDED)
// Download serviceAccountKey.json from Firebase Console:
//   Firebase Console > Project Settings > Service Accounts > Generate New Private Key
// Place the file in the project root as: service-account-key.json

// Option 2: Using environment variables (for production/Render)
// Set these in your .env file

let firebaseApp;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  try {
    // Try loading from service account file first
    const serviceAccount = require('./service-account-key.json');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized with service account file');
  } catch (fileError) {
    // Fallback to environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
      console.log('Firebase Admin initialized with environment variables');
    } else {
      console.warn('Firebase credentials not found. Push notifications will be disabled.');
      console.warn('Place service-account-key.json in project root or set FIREBASE_* env vars.');
      return null;
    }
  }

  return firebaseApp;
}

function getMessaging() {
  const app = initializeFirebase();
  if (!app) return null;
  return admin.messaging();
}

module.exports = { admin, initializeFirebase, getMessaging };
