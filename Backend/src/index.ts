import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Routes
import extractionRoutes from './routes/extraction';
import vlmExtractionRoutes from './routes/vlmExtraction';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import userExtractionRoutes from './routes/userExtraction';
import simplifiedExtractionRoutes from './routes/simplifiedExtraction'; // NEW: Simplified workflow
import userFeedbackRoutes from './routes/userFeedback'; // NEW: User feedback/correction tracking
import costRoutes from './routes/costs'; // NEW: Cost tracking routes
import approverRoutes from './routes/approver'; // NEW: Approver workflow routes

// Middleware
import { errorHandler, notFound } from './middleware/errorHandler';
import { authenticate, requireAdmin, requireUser } from './middleware/auth';
import { auditLog, flushAuditLogsOnShutdown } from './middleware/auditLogger';

// Services
import { checkApiConfiguration } from './services/baseApi';
import { cacheService } from './services/cacheService';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const isProduction = process.env.NODE_ENV === 'production';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '500', 10);

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: {
    success: false,
    error: '⚠️ Too many requests from this IP. Please try again in 15 minutes.',
    timestamp: Date.now()
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/' || req.path === '/api/health'
});


// Rate limiting for extraction endpoints disabled
// const extractionLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 50, // Limit to 50 extractions per 15 minutes
//   message: {
//     success: false,
//     error: '⚠️ Extraction limit reached. You can perform 50 extractions every 15 minutes. Please wait before trying again.',
//     timestamp: Date.now()
//   },
//   standardHeaders: true,
//   legacyHeaders: false
// });

// CORS configuration (must be before rate limiter so preflight 429s still include CORS headers)
const allowedOrigins = [
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : []),
  process.env.FRONTEND_URL,
  'https://ai-fashion-extractor.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow localhost/LAN origins only in development
    if (!isProduction && (origin.startsWith('http://192.168.') || origin.startsWith('http://localhost') || origin.startsWith('http://'))) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowed => 
      allowed && (origin === allowed || origin.includes(allowed.replace('https://', '').replace('http://', '')))
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS check: Requested origin '${origin}' not in allowed list [${allowedOrigins.filter(Boolean).join(', ')}]`);
      callback(null, true); // Allow for now to prevent blocking, but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 3600
}));

// Apply general rate limiting to all API routes (after CORS so rate-limit responses include CORS headers)
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded images as static files
app.use('/uploads', express.static('uploads'));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ═══════════════════════════════════════════════════════
// PUBLIC ROUTES (No authentication required)
// ═══════════════════════════════════════════════════════
app.use('/api/auth', authRoutes); // Login, verify token

// ═══════════════════════════════════════════════════════
// ADMIN ROUTES (Admin role required + Audit logging)
// ═══════════════════════════════════════════════════════
app.use('/api/admin', authenticate, requireAdmin, auditLog, adminRoutes);

// ═══════════════════════════════════════════════════════
// USER ROUTES (Authentication required + Audit logging)
// ═══════════════════════════════════════════════════════
app.use('/api/user', authenticate, requireUser, auditLog, userExtractionRoutes);

// ═══════════════════════════════════════════════════════
// USER FEEDBACK ROUTES (Track corrections & learning)
// ═══════════════════════════════════════════════════════
app.use('/api/user/feedback', authenticate, requireUser, userFeedbackRoutes);

// ═══════════════════════════════════════════════════════
// SIMPLIFIED WORKFLOW ROUTES (New workflow: Dept → Major Category → Extract)
// ═══════════════════════════════════════════════════════
app.use('/api/user/simplified', authenticate, requireUser, auditLog, simplifiedExtractionRoutes);

// ═══════════════════════════════════════════════════════
// LEGACY ROUTES (Backward compatibility - TO BE DEPRECATED)
// ═══════════════════════════════════════════════════════
// These routes will be removed in future versions
// All clients should migrate to /api/user/* endpoints
app.use('/api/extract', authenticate, requireUser, extractionRoutes);
app.use('/api/vlm', authenticate, requireUser, vlmExtractionRoutes);

// ═══════════════════════════════════════════════════════
// COST TRACKING ROUTES (User cost tracking + Admin analytics)
// ═══════════════════════════════════════════════════════
app.use('/api/user/costs', authenticate, requireUser, costRoutes);
app.use('/api/admin/costs', authenticate, requireAdmin, costRoutes);

// ═══════════════════════════════════════════════════════
// APPROVER ROUTES (Approver role required)
// ═══════════════════════════════════════════════════════
app.use('/api/approver', authenticate, auditLog, approverRoutes); // TODO: Add requireApprover middleware

// Health check endpoint (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', async (req, res) => {
  try {
    const cacheStats = await cacheService.getStats();

    res.json({
      message: 'AI Fashion Extractor Backend API',
      version: '2.0.0-vlm',
      status: 'running',
      cache: {
        enabled: cacheStats.enabled,
        connected: cacheStats.connected,
        entries: cacheStats.totalKeys || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      message: 'AI Fashion Extractor Backend API',
      version: '2.0.0-vlm',
      status: 'running',
      cache: { enabled: false, connected: false, entries: 0 },
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Check API configuration on startup
const configCheck = checkApiConfiguration();
if (!configCheck.configured) {
  console.warn('⚠️  API Configuration Warning:');
  console.warn(`   ${configCheck.message}`);
  console.warn('   Suggestions:');
  configCheck.suggestions.forEach(suggestion => {
    console.warn(`   - ${suggestion}`);
  });
} else {
  console.log('✅ API configuration looks good!');
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API available at: /api`);
  console.log(`🏥 Health check: /api/health`);
  console.log(`🔐 Security: Authentication & authorization enabled`);
  console.log(`📊 Audit logging: ${process.env.ENABLE_AUDIT_LOGGING !== 'false' ? 'Enabled' : 'Disabled'}`);

  if (!isProduction) {
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  }

  console.log(`\n📖 API Documentation:`);
  console.log(`   Public:  POST /api/auth/login, POST /api/auth/verify`);
  console.log(`   User:    POST /api/user/extract/*, GET /api/user/categories/*`);
  console.log(`   Admin:   /api/admin/* (requires ADMIN role)`);
  console.log(`\n⚠️  Note: Legacy routes /api/extract/*, /api/vlm/* require authentication`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  await flushAuditLogsOnShutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n🔄 SIGINT received, shutting down gracefully...');
  await flushAuditLogsOnShutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;