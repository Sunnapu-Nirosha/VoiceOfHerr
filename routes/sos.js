const express = require('express');
const { body, validationResult } = require('express-validator');
const SOSAlert = require('../models/SOSAlert');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const twilioClient = accountSid && authToken ? new twilio(accountSid, authToken) : null;

const router = express.Router();

// Validation rules
const createAlertValidation = [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('emergencyType')
    .optional()
    .isIn(['harassment', 'assault', 'medical', 'accident', 'other'])
    .withMessage('Invalid emergency type')
];

// Helper to format phone numbers to E.164 (Indian) format
function formatPhoneNumber(phone) {
  if (!phone) return '';
  phone = phone.trim();
  if (phone.startsWith('+')) return phone;
  if (/^[6-9]\d{9}$/.test(phone)) return '+91' + phone;
  if (/^0[6-9]\d{9}$/.test(phone)) return '+91' + phone.slice(1);
  return phone;
}

// Create SOS alert
router.post('/create', authenticateToken, createAlertValidation, async (req, res) => {
  console.log('Received SOS alert request');
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { latitude, longitude, address, description, emergencyType } = req.body;
    const user = req.user;

    // Create new SOS alert
    const sosAlert = new SOSAlert({
      userId: user._id,
      userAadhar: user.aadhar,
      userName: user.name || 'Anonymous',
      userPhone: user.phone,
      location: {
        latitude,
        longitude,
        address: address || ''
      },
      description: description || '',
      emergencyType: emergencyType || 'other'
    });

    await sosAlert.save();

    // Automatically send notifications to ALL users in the system
    let notificationResults = [];
    try {
      // Get ALL users in the system (except the user who triggered the alert)
      const allUsers = await User.find({ 
        isActive: true, 
        _id: { $ne: user._id } 
      });

      if (allUsers && allUsers.length > 0) {
        const alertLocation = sosAlert.location && sosAlert.location.latitude && sosAlert.location.longitude
          ? `https://maps.google.com/?q=${sosAlert.location.latitude},${sosAlert.location.longitude}`
          : 'Location not available';

        const emergencyMessage = `🚨 EMERGENCY SOS 🚨\n\n${user.name || 'A user'} (${user.phone}) is in danger and needs immediate help!\n\n📍 Location: ${alertLocation}\n\n⚠️ Please respond immediately!`;

        // Send notifications to ALL users
        console.log(`Attempting to notify ${allUsers.length} users...`);
        console.log('Twilio configured:', !!(twilioClient && twilioPhone));
        
        for (const userDoc of allUsers) {
          let status = 'sent';
          let errorMsg = '';
          const formattedPhone = formatPhoneNumber(userDoc.phone);
          console.log(`Processing user: ${userDoc.name} (${formattedPhone})`);
          
          try {
            if (twilioClient && twilioPhone) {
              // Try SMS first
              console.log(`Sending SMS to ${formattedPhone} via Twilio...`);
              await twilioClient.messages.create({
                body: emergencyMessage,
                from: twilioPhone,
                to: formattedPhone
              });
              console.log(`SMS sent successfully to user: ${userDoc.name} (${formattedPhone})`);
            } else {
              // Fallback: Log the emergency for manual notification
              console.log(`🚨 EMERGENCY ALERT - Manual notification required:`);
              console.log(`User: ${userDoc.name} (${formattedPhone})`);
              console.log(`User in danger: ${user.name || 'Unknown'} (${user.phone})`);
              console.log(`Location: ${alertLocation}`);
              console.log(`Alert ID: ${sosAlert._id}`);
              
              status = 'logged';
              errorMsg = 'SMS not configured - emergency logged for manual notification';
            }
          } catch (err) {
            // If SMS fails, log for manual notification
            console.error(`Failed to send SMS to user ${userDoc.name} (${formattedPhone}):`, err);
            console.log(`🚨 EMERGENCY ALERT - Manual notification required:`);
            console.log(`User: ${userDoc.name} (${formattedPhone})`);
            console.log(`User in danger: ${user.name || 'Unknown'} (${user.phone})`);
            console.log(`Location: ${alertLocation}`);
            console.log(`Location: ${alertLocation}`);
            console.log(`Alert ID: ${sosAlert._id}`);
            
            status = 'failed';
            errorMsg = `SMS failed: ${err.message}`;
          }
          
          notificationResults.push({
            name: userDoc.name,
            phone: formattedPhone,
            relationship: 'System User',
            status,
            error: errorMsg
          });
        }

        // Update alert with notification results
        sosAlert.notifiedContacts = notificationResults.map(result => ({
          phone: result.phone,
          response: 'pending',
          notifiedAt: new Date(),
          status: result.status,
          error: result.error
        }));
        await sosAlert.save();
      } else {
        console.log('No other users found in the system');
      }
    } catch (notificationError) {
      console.error('Notification error during SOS creation:', notificationError);
      // Don't fail the SOS creation if notifications fail
    }

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

// Get all active SOS alerts (for emergency response)
router.get('/active', async (req, res) => {
  try {
    const activeAlerts = await SOSAlert.getActiveAlerts();
    
    res.json({
      alerts: activeAlerts.map(alert => alert.getSummary()),
      count: activeAlerts.length
    });

  } catch (error) {
    console.error('Get active alerts error:', error);
    res.status(500).json({ error: 'Failed to get active alerts' });
  }
});

// Get user's SOS alerts
router.get('/my-alerts', authenticateToken, async (req, res) => {
  try {
    const userAlerts = await SOSAlert.getUserAlerts(req.user._id);
    
    res.json({
      alerts: userAlerts.map(alert => alert.getSummary()),
      count: userAlerts.length
    });

  } catch (error) {
    console.error('Get user alerts error:', error);
    res.status(500).json({ error: 'Failed to get user alerts' });
  }
});

// Get specific SOS alert
router.get('/:alertId', async (req, res) => {
  try {
    const alert = await SOSAlert.findById(req.params.alertId)
      .populate('userId', 'name phone aadhar')
      .populate('resolvedBy', 'name phone');

    if (!alert) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }

    res.json({ alert });

  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// Update SOS alert status
router.put('/:alertId/status', authenticateToken, [
  body('status')
    .isIn(['active', 'resolved', 'false_alarm'])
    .withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { status, resolutionNotes } = req.body;
    const alert = await SOSAlert.findById(req.params.alertId);

    if (!alert) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }

    // Only allow status updates for active alerts
    if (alert.status !== 'active') {
      return res.status(400).json({ error: 'Can only update active alerts' });
    }

    alert.status = status;
    if (status === 'resolved') {
      alert.resolvedAt = new Date();
      alert.resolvedBy = req.user._id;
    }

    await alert.save();

    res.json({
      message: 'Alert status updated successfully',
      alert: alert.getSummary()
    });

  } catch (error) {
    console.error('Update alert status error:', error);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
});

// Add emergency contact response
router.post('/:alertId/contact-response', [
  body('contactPhone').notEmpty().withMessage('Contact phone is required'),
  body('response').isIn(['acknowledged', 'responding', 'unreachable']).withMessage('Invalid response')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { contactPhone, response } = req.body;
    const alert = await SOSAlert.findById(req.params.alertId);

    if (!alert) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }

    // Find and update the contact response
    const contact = alert.notifiedContacts.find(c => c.phone === contactPhone);
    if (contact) {
      contact.response = response;
      contact.notifiedAt = new Date();
    } else {
      alert.notifiedContacts.push({
        phone: contactPhone,
        response,
        notifiedAt: new Date()
      });
    }

    await alert.save();

    res.json({
      message: 'Contact response recorded successfully',
      alert: alert.getSummary()
    });

  } catch (error) {
    console.error('Contact response error:', error);
    res.status(500).json({ error: 'Failed to record contact response' });
  }
});

// Get nearby alerts (for emergency response)
router.get('/nearby/:latitude/:longitude/:radius', async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.params;
    const radiusInMeters = parseFloat(radius) * 1000; // Convert km to meters

    const nearbyAlerts = await SOSAlert.find({
      status: 'active',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: radiusInMeters
        }
      }
    }).populate('userId', 'name phone aadhar');

    res.json({
      alerts: nearbyAlerts.map(alert => alert.getSummary()),
      count: nearbyAlerts.length
    });

  } catch (error) {
    console.error('Get nearby alerts error:', error);
    res.status(500).json({ error: 'Failed to get nearby alerts' });
  }
});

// Emergency contact notification endpoint
router.post('/:alertId/notify-contacts', authenticateToken, async (req, res) => {
  try {
    const alert = await SOSAlert.findById(req.params.alertId)
      .populate('userId');

    if (!alert) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }

    // Fix: Compare user IDs correctly whether populated or not
    const alertUserId = alert.userId._id ? alert.userId._id.toString() : alert.userId.toString();
    if (alertUserId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to notify contacts for this alert' });
    }

    // Get the user's emergency contacts
    const user = await User.findById(req.user._id);
    if (!user || !user.emergencyContacts || user.emergencyContacts.length === 0) {
      return res.status(400).json({ 
        error: 'No emergency contacts found. Please add emergency contacts in your profile.' 
      });
    }

    const notificationResults = [];
    const alertLocation = alert.location && alert.location.latitude && alert.location.longitude
      ? `https://maps.google.com/?q=${alert.location.latitude},${alert.location.longitude}`
      : 'Location not available';

    const emergencyMessage = `🚨 EMERGENCY SOS 🚨\n\n${req.user.name || 'A user'} (${req.user.phone}) is in danger and needs immediate help!\n\n📍 Location: ${alertLocation}\n\n⚠️ Please respond immediately!`;

    // Send notifications to emergency contacts
    for (const contact of user.emergencyContacts) {
      let status = 'sent';
      let errorMsg = '';
      const formattedPhone = formatPhoneNumber(contact.phone);
      try {
        if (twilioClient && twilioPhone) {
          // Try SMS first
          await twilioClient.messages.create({
            body: emergencyMessage,
            from: twilioPhone,
            to: formattedPhone
          });
          console.log(`SMS sent successfully to emergency contact: ${contact.name} (${formattedPhone})`);
        } else {
          // Fallback: Log the emergency for manual notification
          console.log(`🚨 EMERGENCY ALERT - Manual notification required:`);
          console.log(`Contact: ${contact.name} (${formattedPhone})`);
          console.log(`User in danger: ${req.user.name || 'Unknown'} (${req.user.phone})`);
          console.log(`Location: ${alertLocation}`);
          console.log(`Alert ID: ${alert._id}`);
          
          status = 'logged';
          errorMsg = 'SMS not configured - emergency logged for manual notification';
        }
      } catch (err) {
        // If SMS fails, log for manual notification
        console.error(`Failed to send SMS to emergency contact ${contact.name} (${formattedPhone}):`, err);
        console.log(`🚨 EMERGENCY ALERT - Manual notification required:`);
        console.log(`Contact: ${contact.name} (${formattedPhone})`);
        console.log(`User in danger: ${req.user.name || 'Unknown'} (${req.user.phone})`);
        console.log(`Location: ${alertLocation}`);
        console.log(`Alert ID: ${alert._id}`);
        
        status = 'failed';
        errorMsg = `SMS failed: ${err.message}`;
      }
      
      notificationResults.push({
        name: contact.name,
        phone: formattedPhone,
        relationship: contact.relationship,
        status,
        error: errorMsg
      });
    }

    // Update alert with notification results
    alert.notifiedContacts = notificationResults.map(result => ({
      phone: result.phone,
      response: 'pending',
      notifiedAt: new Date(),
      status: result.status,
      error: result.error
    }));
    await alert.save();

    res.json({
      message: 'Emergency contacts notified successfully',
      notifications: notificationResults,
      alert: alert.getSummary()
    });

  } catch (error) {
    console.error('Notify contacts error:', error);
    res.status(500).json({ error: 'Failed to notify contacts' });
  }
});

// Test endpoint to check emergency contacts (for debugging)
router.get('/test/emergency-contacts', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone
      },
      emergencyContacts: user.emergencyContacts || [],
      contactCount: user.emergencyContacts ? user.emergencyContacts.length : 0,
      twilioConfigured: !!(twilioClient && twilioPhone),
      message: user.emergencyContacts && user.emergencyContacts.length > 0 
        ? 'Emergency contacts found and ready for notifications'
        : 'No emergency contacts found. Please add contacts in your profile.'
    });

  } catch (error) {
    console.error('Test emergency contacts error:', error);
    res.status(500).json({ error: 'Failed to test emergency contacts' });
  }
});

// Test endpoint to check all users in system (for debugging)
router.get('/test/all-users', authenticateToken, async (req, res) => {
  try {
    const allUsers = await User.find({ isActive: true });
    const currentUser = await User.findById(req.user._id);
    
    // Get users excluding current user
    const otherUsers = allUsers.filter(u => u._id.toString() !== req.user._id.toString());

    res.json({
      currentUser: {
        id: currentUser._id,
        name: currentUser.name,
        phone: currentUser.phone
      },
      totalUsers: allUsers.length,
      otherUsers: otherUsers.length,
      usersList: otherUsers.map(u => ({
        id: u._id,
        name: u.name,
        phone: u.phone,
        isActive: u.isActive
      })),
      twilioConfigured: !!(twilioClient && twilioPhone),
      message: otherUsers.length > 0 
        ? `${otherUsers.length} other users found and ready for notifications`
        : 'No other users found in the system.'
    });

  } catch (error) {
    console.error('Test all users error:', error);
    res.status(500).json({ error: 'Failed to test all users' });
  }
});

module.exports = router; 