const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
require('./config/passport');

const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const automationRoutes = require('./routes/automation');
const { initializeScheduler } = require('./services/automationEngine');
const app = express();

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'https://draftpal.vercel.app',
      process.env.CLIENT_URL,
      'http://localhost:3000'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
}));

app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Enable trust proxy since we're behind a proxy on Render
app.set('trust proxy', 1);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await initializeScheduler();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/automation', automationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error', error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});