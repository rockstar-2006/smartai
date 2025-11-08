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

// Allowed dev origins (keep local vite/webpack dev ports)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8080',
  CLIENT_URL
]);

// --- Middleware ---
// CORS: allow CLIENT_URL and local origins; allow credentials
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (mobile clients, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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
      // Create any DB indexes your app requires
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
// Mount API routes (each route file handles its own path)
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);            // teacher endpoints (save/share/results)
app.use('/api/folders', folderRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/student-quiz', studentQuizRoutes); // student-facing endpoints (token, start, submit)

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
  console.log(`Client URL allowed: ${CLIENT_URL}`);
});
