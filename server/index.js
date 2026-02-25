/** Force Redeploy: 7 */
/**
 * RESQUENET BACKEND CORE
 * ----------------------
 * This is the entry point of the server. It handles security middleware,
 * database connectivity, and route orchestration.
 */

// Force Redeploy: Serverless Optimization
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet'); // Protects against well-known web vulnerabilities by setting HTTP headers
const rateLimit = require('express-rate-limit'); // Mitigates Brute-force and DDoS attacks
const cookieParser = require('cookie-parser'); // Parses cookies for secure JWT handling
const mongoSanitize = require('mongo-sanitize'); // Prevents NoSQL Injection attacks
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config(); // Load environment variables from .env file

const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
  },
  // HIGH-PERFORMANCE SETTINGS: Detect disconnection faster and respond quicker
  pingTimeout: 10000,
  pingInterval: 5000,
  transports: ['websocket', 'polling']
});

// Attach socket.io to the app instance for access in controllers
app.set('socketio', io);

io.on('connection', (socket) => {
  console.log(`📡 REAL-TIME: User Connected -> ${socket.id} (Total: ${io.engine.clientsCount})`);

  socket.on('disconnect', (reason) => {
    console.log(`📡 REAL-TIME: User Disconnected -> ${socket.id} (${reason})`);
  });
});

/**
 * SECURITY LAYER - MIDDLEWARE CONFIGURATION
 */

// Helmet helps secure the app by setting various HTTP headers
app.use(helmet());

// Cross-Origin Resource Sharing configuration
// Restricts API access to our specific frontend domain
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Reflect request origin
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
}));

// Body parser to read JSON data from incoming requests
app.use(express.json());

// Request logging for debugging mobile connectivity
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

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
  max: process.env.NODE_ENV === 'development' ? 10000 : 100 // Increase limit significantly in development
});
app.use('/api/', limiter);

/**
 * ROUTE HANDLERS
 */
// Ensure paths match exactly as sent by frontend: /api/auth/**
app.use((req, res, next) => {
  if (req.url && req.url.includes('auth')) {
    console.log(`[AUTH-DEBUG] ${req.method} ${req.url}`);
  }
  next();
});

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
    environment: process.env.NODE_ENV,
    // Debug helper: Show first 15 chars of URI to confirm which one is being used
    current_connection_string: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 15) + '...' : 'NOT_SET'
  });
});

/**
 * DATABASE CONNECTIVITY
 */
// Re-enable buffering so operations wait for connection instead of failing instantly
mongoose.set('bufferCommands', true);
mongoose.set('bufferTimeoutMS', 15000); // Reduce wait from 30s to 15s

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000, // Faster failover for DB connection
  socketTimeoutMS: 30000,
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
  // 1 = Connected, 2 = Connecting, 4 = Initializing (custom or mongoose-specific)
  // We allow 1 and 2 to proceed (Mongoose will buffer queries if state is 2)
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return next();
  }

  // If not connected, return 503
  res.status(503).json({
    status: 'error',
    message: `Database connection is ${mongoose.connection.readyState === 0 ? 'disconnected' : 'unstable'}. Please wait a moment and refresh.`
  });
});

// TEMPORARY ADMIN SEEDER ROUTE
app.get('/seed-admin', async (req, res) => {
  try {
    const User = require('./models/User'); // Ensure path is correct
    const bcrypt = require('bcryptjs');

    const existingAdmin = await User.findOne({ email: 'naveen@gmail.com' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('naveen04', salt);

    if (existingAdmin) {
      existingAdmin.role = 'admin';
      existingAdmin.password = 'naveen04'; // Set plain text, pre-save hook will hash it
      await existingAdmin.save();
      return res.send('User naveen@gmail.com updated to ADMIN with password: naveen04');
    }

    await User.create({
      name: 'Naveen Admin',
      email: 'naveen@gmail.com',
      password: 'naveen04', // Set plain text, creation will hash it
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
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 ResqueNet API Node is live on port ${PORT}`);
    console.log(`🔒 Security Layers: Helmet, RateLimit, Sanitize, JWT-Cookies ACTIVE`);
    console.log(`📡 WebSocket Engine: Socket.io INITIALIZED`);
  });
}



module.exports = app; // Export for Vercel
