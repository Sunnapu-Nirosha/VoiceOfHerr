const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const sosRoutes = require('./routes/sos');
const userRoutes = require('./routes/users');
const fcmRoutes = require('./routes/fcm');

const app = express();
const PORT = 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:"],
      scriptSrc: ["'self'", "https://www.gstatic.com", "https://www.googleapis.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
      connectSrc: ["'self'", "https://fcm.googleapis.com", "https://firebaseinstallations.googleapis.com"],
      workerSrc: ["'self'", "blob:"],
    }
  }
}));
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-of-her', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/users', userRoutes);
app.use('/api/fcm', fcmRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Voice of Her Backend is running' });
});

// Dashboard stats endpoint
const { authenticateToken } = require('./middleware/auth');
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const SOSAlert = require('./models/SOSAlert');
    const User = require('./models/User');
    const user = await User.findById(req.user._id).select('-password');
    const userAlerts = await SOSAlert.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const activeAlerts = await SOSAlert.find({ status: 'active' }).countDocuments();
    const totalUsers = await User.countDocuments({ isActive: true });

    const myActiveAlerts = userAlerts.filter(a => a.status === 'active').length;
    const myResolvedAlerts = userAlerts.filter(a => a.status === 'resolved').length;
    const totalAlerts = userAlerts.length;
    const recentAlerts = userAlerts.slice(0, 5).map(a => a.getSummary());

    res.json({
      user: user ? user.toPublicJSON() : null,
      stats: {
        emergencyContacts: user ? user.emergencyContacts.length : 0,
        myActiveAlerts,
        myResolvedAlerts,
        totalAlerts,
        activeAlertsGlobal: activeAlerts,
        totalUsers
      },
      recentAlerts
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// Firebase web config endpoint (serves FCM config to frontend)
app.get('/api/firebase-config', (req, res) => {
  try {
    const config = require('../frontend/firebase-web-config.js');
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Firebase config not found' });
  }
});

// Serve the main index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Main page: http://localhost:${PORT}/`);
});