// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const folderRoutes = require('./routes/folder');
const bookmarkRoutes = require('./routes/bookmark');
const studentRoutes = require('./routes/student');
const studentQuizRoutes = require('./routes/studentQuiz');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { createIndexes } = require('./config/dbIndexes');

const app = express();

// --- Config ---
const PORT = process.env.PORT || 3001;

// allowed origins: include your local dev and production frontend (Vercel) URLs
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:8080';
const VERCEL_URL = process.env.VERCEL_URL || ''; // set in your env when deployed
const allowedOrigins = new Set(
  [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
    CLIENT_URL,
    VERCEL_URL
  ].filter(Boolean)
);

// --- CORS middleware (echo origin when allowed) ---
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    // non-browser clients: allow
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); // echo back
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    console.warn(`Blocked CORS request from origin: ${origin}`);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

// quick OPTIONS handler
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(200);
  }
  return res.sendStatus(403);
});

// parse JSON and cookies
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- MongoDB connect (env: MONGODB_URI) ---
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/quizapp';
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected successfully');
    if (typeof createIndexes === 'function') {
      try {
        await createIndexes();
        console.log('DB indexes created');
      } catch (err) {
        console.error('Error creating DB indexes:', err);
      }
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

// health
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

// error handlers
app.use(notFound);
app.use(errorHandler);

// start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed client origins:`, Array.from(allowedOrigins));
});
