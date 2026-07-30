const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Save or update FCM token for a user
router.post('/token', authenticateToken, [
  body('fcmToken').notEmpty().withMessage('FCM token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { fcmToken } = req.body;
    const userId = req.user._id;

    // Update user's FCM token
    await User.findByIdAndUpdate(userId, { fcmToken: fcmToken });

    console.log('FCM token saved for user:', userId);
    res.json({ message: 'FCM token saved successfully' });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ error: 'Failed to save FCM token' });
  }
});

// Delete FCM token (on logout)
router.delete('/token', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { fcmToken: null });
    console.log('FCM token removed for user:', req.user._id);
    res.json({ message: 'FCM token removed' });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({ error: 'Failed to remove FCM token' });
  }
});

module.exports = router;
