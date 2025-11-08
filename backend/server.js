// app.js (updated for production-ready CORS, security, logging, and graceful shutdown)
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const folderRoutes = require('./routes/folder');
const bookmarkRoutes = require('./routes/bookmark');
const studentRoutes = require('./routes/student');
const studentQuizRoutes = require('./routes/studentQuiz');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { createIndexes } = require('./config/dbIndexes');

const app = express();

// --- Config / Environment ---
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:8080';
const VERCEL_URL = process.env.VERCEL_URL || 'https://smartai-ten.vercel.app';

// Allow additional origins via comma-separated env variable (useful in Render/CI)
// Example: EXTRA_ALLOWED_ORIGINS="https://staging.example.com,https://another.app"
const extraOrigins = process.env.EXTRA_ALLOWED_ORIGINS
  ? process.env.EXTRA_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// Allowed dev/origins set (includes typical local dev ports, client and vercel)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  CLIENT_URL,
  VERCEL_URL,
  ...extraOrigins,
].filter(Boolean));

// --- Security & Middleware ---
// Trust proxy when behind a load balancer / render/ vercel (needed for secure cookies and HTTPS enforcement)
app.set('trust proxy', 1);

// Helmet for secure headers
app.use(helmet());

// Logging (use morgan in dev and production; Render will capture logs)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic rate limiting to protect endpoints from abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Enforce HTTPS in production (redirect non-HTTPS requests)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // If behind a proxy (Render/Vercel) the protocol might be in x-forwarded-proto
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (proto && proto === 'http') {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
  }
  next();
});

// CORS: allow specific origins only, and allow credentials (cookies)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    // non-browser clients (curl, server-to-server) - either allow or deny based on policy
    // we allow here but do not set credentials header
    res.header('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.has(origin)) {
    // echo back origin (required when credentials=true)
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    // origin not explicitly allowed: don't set Access-Control-Allow-Origin
    // For preflight we return 403 so browser will block
    if (req.method === 'OPTIONS') {
      return res.status(403).send('CORS Forbidden');
    }
  }

  // common CORS headers
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  next();
});

// handle preflight requests quickly (OPTIONS)
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(200);
  }
  return res.sendStatus(403);
});

// Parse JSON and cookies BEFORE routes
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Database connection ---
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/quizapp';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('MongoDB connected successfully');
    try {
      if (typeof createIndexes === 'function') {
        await createIndexes();
        console.log('DB indexes created');
      }
    } catch (err) {
      console.error('Error creating DB indexes:', err);
    }
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/student-quiz', studentQuizRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running', env: process.env.NODE_ENV || 'development' });
});

// 404 / error handlers (must be after routes)
app.use(notFound);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed client origins:`, Array.from(allowedOrigins));
});

// Graceful shutdown
const shutDown = () => {
  console.log('Received kill signal, shutting down gracefully');
  server.close(() => {
    console.log('Closed out remaining connections');
    mongoose.connection.close(false, () => {
      console.log('Mongo connection closed. Exiting.');
      process.exit(0);
    });
  });

  // if still not closed after 10 seconds, exit forcefully
  setTimeout(() => {
    console.error('Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

module.exports = app;
