const express = require('express');
const { body, validationResult } = require('express-validator');
const SOSAlert = require('../models/SOSAlert');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const { getMessaging } = require('../firebase-config');

const router = express.Router();

// Twilio setup
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Email setup
const emailTransport = (process.env.EMAIL_USER && process.env.EMAIL_PASS)
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    }) : null;

const createAlertValidation = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('description').optional().isLength({ max: 500 }),
  body('emergencyType').optional().isIn(['harassment', 'assault', 'medical', 'accident', 'other'])
];

function formatPhone(phone) {
  if (!phone) return '';
  phone = phone.trim();
  if (phone.startsWith('+')) return phone;
  if (/^[6-9]\d{9}$/.test(phone)) return '+91' + phone;
  if (/^0[6-9]\d{9}$/.test(phone)) return '+91' + phone.slice(1);
  return phone;
}

// Create SOS alert - sends Email + Call + SMS + In-App to ALL users
router.post('/create', authenticateToken, createAlertValidation, async (req, res) => {
  console.log('=== SOS ALERT TRIGGERED ===');
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { latitude, longitude, address, description, emergencyType } = req.body;
    const user = req.user;

    const sosAlert = new SOSAlert({
      userId: user._id,
      userAadhar: user.aadhar,
      userName: user.name || 'Anonymous',
      userPhone: user.phone,
      location: { latitude, longitude, address: address || '' },
      description: description || '',
      emergencyType: emergencyType || 'other'
    });
    await sosAlert.save();
    console.log('SOS alert saved:', sosAlert._id);

    const allUsers = await User.find({ isActive: true, _id: { $ne: user._id } });
    console.log('Found', allUsers.length, 'other users to notify');

    const alertLocation = (latitude && longitude)
      ? 'https://maps.google.com/?q=' + latitude + ',' + longitude
      : 'Location not available';

    const userName = user.name || 'A user';
    const userPhone = user.phone;

    const smsMessage = 'EMERGENCY SOS! ' + userName + ' (' + userPhone + ') needs help! Location: ' + alertLocation;
    const callMessage = 'EMERGENCY SOS alert. ' + userName + ' needs immediate help. Please respond now.';
    const emailHtml = '<h2 style="color:#ff4757;">EMERGENCY SOS ALERT</h2>'
      + '<p><strong>' + userName + '</strong> (' + userPhone + ') is in danger and needs immediate help!</p>'
      + '<p><strong>Location:</strong> <a href="' + alertLocation + '">' + alertLocation + '</a></p>'
      + '<p><strong>Type:</strong> ' + (emergencyType || 'other') + '</p>'
      + '<p style="color:#ff4757;font-weight:bold;">Please respond immediately!</p>'
      + '<hr><p style="font-size:12px;color:#999;">Voice of Her - Emergency Alert System</p>';
    const emailText = userName + ' (' + userPhone + ') is in danger! Location: ' + alertLocation + '. Please respond immediately!';

    const notificationResults = [];

    for (const userDoc of allUsers) {
      const formattedPhone = formatPhone(userDoc.phone);
      let emailStatus = 'skipped';
      let callStatus = 'skipped';
      let smsStatus = 'skipped';

      console.log('Notifying:', userDoc.name, formattedPhone, userDoc.email || '(no email)');

      // 1. SEND EMAIL (free, works for all)
      if (emailTransport && userDoc.email) {
        try {
          await emailTransport.sendMail({
            from: '"Voice of Her SOS" <' + process.env.EMAIL_USER + '>',
            to: userDoc.email,
            subject: 'EMERGENCY SOS - ' + userName + ' needs help!',
            text: emailText,
            html: emailHtml
          });
          emailStatus = 'sent';
          console.log('  EMAIL sent ->', userDoc.email);
        } catch (emailErr) {
          emailStatus = 'failed';
          console.log('  EMAIL failed:', emailErr.message);
        }
      }

      // 2. TRY PHONE CALL via Twilio
      if (twilioClient && twilioPhone && formattedPhone) {
        try {
          const call = await twilioClient.calls.create({
            url: 'http://twimlets.com/voice?Message=' + encodeURIComponent(callMessage),
            to: formattedPhone,
            from: twilioPhone
          });
          callStatus = 'sent';
          console.log('  CALL sent ->', call.sid);
        } catch (callErr) {
          callStatus = 'failed';
          console.log('  CALL failed:', callErr.message);
        }

        // 3. TRY SMS via Twilio
        try {
          const sms = await twilioClient.messages.create({
            body: smsMessage,
            from: twilioPhone,
            to: formattedPhone
          });
          smsStatus = 'sent';
          console.log('  SMS sent ->', sms.sid);
        } catch (smsErr) {
          smsStatus = 'failed';
          console.log('  SMS failed:', smsErr.message);
        }
      }

      notificationResults.push({
        name: userDoc.name,
        phone: formattedPhone,
        email: userDoc.email || '',
        emailStatus: emailStatus,
        callStatus: callStatus,
        smsStatus: smsStatus
      });
    }

    // 5. SEND FCM PUSH NOTIFICATIONS to all users with FCM tokens
    const fcmMessaging = getMessaging();
    if (fcmMessaging) {
      const usersWithFCM = allUsers.filter(function(u) { return u.fcmToken; });
      console.log('Sending FCM notifications to', usersWithFCM.length, 'users');

      for (const userDoc of usersWithFCM) {
        try {
          const fcmFormattedPhone = formatPhone(userDoc.phone);
          const fcmPayload = {
            token: userDoc.fcmToken,
            notification: {
              title: 'EMERGENCY SOS ALERT',
              body: userName + ' (' + userPhone + ') needs help! Tap for details.'
            },
            data: {
              type: 'sos_alert',
              alertId: sosAlert._id.toString(),
              userName: userName,
              userPhone: userPhone,
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              location: alertLocation,
              emergencyType: emergencyType || 'other',
              timestamp: new Date().toISOString()
            },
            android: {
              priority: 'high',
              notification: {
                channelId: 'sos-alerts',
                priority: 'max',
                sound: 'default'
              }
            },
            webpush: {
              headers: {
                TTL: '86400'
              },
              notification: {
                title: 'EMERGENCY SOS ALERT',
                body: userName + ' (' + userPhone + ') needs help! Tap for details.',
                icon: '/images/sos.svg',
                badge: '/images/sos.svg',
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200]
              }
            }
          };

          const response = await fcmMessaging.send(fcmPayload);
          console.log('  FCM sent to', userDoc.name, ':', response);

          // Update notification results for this user
          var existingResult = notificationResults.find(function(r) { return r.phone === fcmFormattedPhone; });
          if (existingResult) {
            existingResult.fcmStatus = 'sent';
          }
        } catch (fcmErr) {
          console.log('  FCM failed for', userDoc.name, ':', fcmErr.message);

          // If token is invalid, remove it from user
          if (fcmErr.code === 'messaging/registration-token-not-registered') {
            await User.findByIdAndUpdate(userDoc._id, { fcmToken: null });
            console.log('  Removed invalid FCM token for user:', userDoc.name);
          }

          var existingResult = notificationResults.find(function(r) { return r.phone === formatPhone(userDoc.phone); });
          if (existingResult) {
            existingResult.fcmStatus = 'failed';
          }
        }
      }
    } else {
      console.log('FCM not configured, skipping push notifications');
    }

    // Save results
    sosAlert.notifiedContacts = notificationResults.map(function(r) {
      const anySent = (r.emailStatus === 'sent' || r.callStatus === 'sent' || r.smsStatus === 'sent' || r.fcmStatus === 'sent');
      return {
        phone: r.phone,
        response: 'pending',
        notifiedAt: new Date(),
        status: anySent ? 'sent' : 'failed',
        error: 'Email:' + r.emailStatus + ' Call:' + r.callStatus + ' SMS:' + r.smsStatus + ' FCM:' + (r.fcmStatus || 'skipped')
      };
    });
    await sosAlert.save();

    console.log('=== SOS NOTIFICATIONS COMPLETE ===');
    res.status(201).json({
      message: 'SOS alert created successfully',
      alert: sosAlert.getSummary(),
      notifications: notificationResults
    });

  } catch (error) {
    console.error('SOS creation error:', error);
    res.status(500).json({ error: 'Failed to create SOS alert' });
  }
});

// Get active SOS alerts (for in-app notifications)
router.get('/active', async (req, res) => {
  try {
    const activeAlerts = await SOSAlert.find({ status: 'active' }).sort({ createdAt: -1 }).limit(10);
    res.json({
      alerts: activeAlerts.map(function(a) {
        return { id: a._id, userName: a.userName, userPhone: a.userPhone, emergencyType: a.emergencyType, location: a.location, description: a.description, createdAt: a.createdAt, status: a.status };
      }),
      count: activeAlerts.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active alerts' });
  }
});

// Get user's SOS alerts
router.get('/my-alerts', authenticateToken, async (req, res) => {
  try {
    const userAlerts = await SOSAlert.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ alerts: userAlerts.map(function(a) { return a.getSummary(); }), count: userAlerts.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user alerts' });
  }
});

// Update SOS alert status
router.put('/:alertId/status', authenticateToken, [
  body('status').isIn(['active', 'resolved', 'false_alarm'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed' });

    const alert = await SOSAlert.findById(req.params.alertId);
    if (!alert) return res.status(404).json({ error: 'SOS alert not found' });

    alert.status = req.body.status;
    if (req.body.status === 'resolved') { alert.resolvedAt = new Date(); alert.resolvedBy = req.user._id; }
    await alert.save();
    res.json({ message: 'Alert updated', alert: alert.getSummary() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

module.exports = router;
