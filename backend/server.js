// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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
// Add your production frontend (Vercel) explicitly:
const VERCEL_URL = process.env.VERCEL_URL || 'https://smartai-ten.vercel.app';

// Allowed dev/origins (keep local vite/webpack dev ports)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  CLIENT_URL,
  VERCEL_URL,
].filter(Boolean));

// --- Middleware ---
// CORS: allow specific origins only, and allow credentials (cookies)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    // allow non-browser requests (curl, postman)
    res.header('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.has(origin)) {
    // echo back origin (required when credentials=true)
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    // origin not allowed — do not set header (browser will block)
    console.warn(`Blocked CORS request from origin: ${origin}`);
  }
  // common CORS headers
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  // continue
  next();
});

// handle preflight requests quickly (OPTIONS)
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.has(origin)) {
    // If origin allowed or missing, respond OK
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
  } else {
    res.sendStatus(403);
  }
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
  res.json({ status: 'OK', message: 'Server is running' });
});

// 404 / error handlers (must be after routes)
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed client origins:`, Array.from(allowedOrigins));
});
