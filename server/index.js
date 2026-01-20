/** Force Redeploy: 1 */
/**
 * RESQUENET BACKEND CORE
 * ----------------------
 * This is the entry point of the server. It handles security middleware,
 * database connectivity, and route orchestration.
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet'); // Protects against well-known web vulnerabilities by setting HTTP headers
const rateLimit = require('express-rate-limit'); // Mitigates Brute-force and DDoS attacks
const cookieParser = require('cookie-parser'); // Parses cookies for secure JWT handling
const mongoSanitize = require('mongo-sanitize'); // Prevents NoSQL Injection attacks
require('dotenv').config(); // Load environment variables from .env file

const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');

const app = express();

/**
 * SECURITY LAYER - MIDDLEWARE CONFIGURATION
 */

// Helmet helps secure the app by setting various HTTP headers
app.use(helmet());

// Cross-Origin Resource Sharing configuration
// Restricts API access to our specific frontend domain
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL // Production URL from Vercel
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS Policy: Access denied'), false);
    }
    return callback(null, true);
  },
  credentials: true // Required to allow secure HttpOnly cookies
}));

// Body parser to read JSON data from incoming requests
app.use(express.json());

// Parser for reading cookies in the auth middleware
app.use(cookieParser());

/**
 * DATA SANITIZATION LAYER
 * Recursively strips keys starting with '$' or '.' to prevent NoSQL Injection
 */
app.use((req, res, next) => {
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  req.params = mongoSanitize(req.params);
  next();
});

/**
 * GLOBAL RATE LIMITER
 * Prevents automated scripts from overwhelming the server
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minute window
  max: 100 // Limit each IP to 100 requests per window
});
app.use('/api/', limiter);

/**
 * ROUTE HANDLERS
 */
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);

// Health Check for Vercel
let dbError = null;

app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({
    status: 'Operational',
    database: dbStatus,
    dbError: dbError ? dbError.message : null,
    environment: process.env.NODE_ENV
  });
});

/**
 * DATABASE CONNECTIVITY
 */
// Re-enable buffering so operations wait for connection instead of failing instantly
mongoose.set('bufferCommands', true);

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
  .then(() => {
    console.log('✅ MongoDB ATLAS Connected Successfully');
    dbError = null;
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    dbError = err;
  });

// Database connection middleware
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1 && !mongoose.connection.readyState === 2) {
    return res.status(503).json({
      status: 'error',
      message: `Database not ready (Current State: ${mongoose.connection.readyState}). Check Vercel Env Vars for URI typos.`
    });
  }
  next();
});

// TEMPORARY ADMIN SEEDER ROUTE
app.get('/seed-admin', async (req, res) => {
  try {
    const User = require('./models/User'); // Ensure path is correct
    const bcrypt = require('bcryptjs');

    const existingAdmin = await User.findOne({ email: 'naveen@gmail.com' });
    if (existingAdmin) {
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      return res.send('User naveen@gmail.com updated to ADMIN');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('naveen04', salt);

    await User.create({
      name: 'Naveen Admin',
      email: 'naveen@gmail.com',
      password: hashedPassword,
      role: 'admin',
      phone: '1234567890'
    });

    res.send('✅ Admin User Created: naveen@gmail.com / naveen04');
  } catch (err) {
    res.status(500).send('Error creating admin: ' + err.message);
  }
});

/**
 * GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

/**
 * SERVER LIFECYCLE
 * app.listen is bypassed during Vercel serverless execution
 */
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 ResqueNet API Node is live on port ${PORT}`);
    console.log(`🔒 Security Layers: Helmet, RateLimit, Sanitize, JWT-Cookies ACTIVE`);
  });
}

module.exports = app; // Export for Vercel
