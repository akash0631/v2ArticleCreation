import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import compression from 'compression';

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
import watcherRoutes from './routes/watcher'; // Watcher service routes
import articleConfigRoutes from './routes/articleConfig';
import modelGenerationRoutes from './routes/modelGeneration';

// Middleware
import { errorHandler, notFound, requestTimeout } from './middleware/errorHandler';
import { authenticate, requireAdmin, requireUser } from './middleware/auth';
import { authenticateWatcher } from './middleware/watcherAuth';
import { auditLog, flushAuditLogsOnShutdown } from './middleware/auditLogger';

// Services
import { checkApiConfiguration } from './services/baseApi';
import { cacheService } from './services/cacheService';
import { mvgrMappingService } from './services/mvgrMappingService';
import { ApproverController } from './controllers/ApproverController';
import { disconnectPrismaClient, isAppShuttingDown, setAppIsShuttingDown } from './utils/prisma';
import { syncFromSrm } from './services/srmSyncService';
import { syncVendorMaster } from './services/vendorMasterSyncService';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

process.on('unhandledRejection', (reason: any) => {
  console.error('❌ Unhandled promise rejection (process kept alive):', reason?.message ?? reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('❌ Uncaught exception (process kept alive):', err.message, err.stack);
});
const isProduction = process.env.NODE_ENV === 'production';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '1000', 10);
let shutdownInProgress = false;

// Trust proxy - required for Cloudflare, load balancers, and rate limiting
app.set('trust proxy', 1);

// Gzip/Brotli response compression — reduces payload size for JSON-heavy API responses
app.use(compression());

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: {
    success: false,
    error: '⚠️ Too many requests from this IP. Please try again in 15 minutes.',
    timestamp: Date.now()
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use CF-Connecting-IP when behind Cloudflare so each real client gets its own bucket.
  // Falls back to ipKeyGenerator (handles IPv6) for non-Cloudflare environments.
  keyGenerator: (req) =>
    (req.headers['cf-connecting-ip'] as string) || ipKeyGenerator(req.ip ?? ''),
  skip: (req) => req.path === '/' || req.path === '/api/health'
});

// Approver API rate limiter — generous limit per user per 15-min window.
// Multiple users share an office NAT IP so the bucket must be large enough
// for concurrent multi-user usage (each page load = 2–3 API calls).
const approverLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.APPROVER_RATE_LIMIT_MAX || '5000', 10),
  message: {
    success: false,
    error: '⚠️ Too many requests. Please wait a moment before making more changes.',
    timestamp: Date.now()
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers['cf-connecting-ip'] as string) || ipKeyGenerator(req.ip ?? ''),
  skip: (req) => false
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
  'https://articlecreation.v2retail.net',
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

// Apply general rate limiting to all API routes EXCEPT:
// - /watcher/   — processes 24k+ images one-by-one, must not be throttled
// - /approver/  — authenticated multi-user routes; per-IP limiting unfairly
//                 blocks whole offices sharing a NAT IP. Auth middleware already
//                 secures these endpoints.
// - /article-config/ — lightweight cached lookups called once per card on load
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/watcher/')) return next();
  if (req.path.startsWith('/approver/')) return next();
  if (req.path.startsWith('/article-config/')) return next();
  return limiter(req, res, next);
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global request timeout — 90s for normal routes, 4min for watcher (processes images).
// /api/model-generation/bulk gets 20min because the upload itself can carry hundreds of
// images; the background worker is unaffected by the request timer.
// /api/admin/majcat-grid/upload gets 15min — 300k+ row Excel insert needs time.
app.use('/api/watcher', requestTimeout(4 * 60 * 1000));
app.use('/api/model-generation/bulk', requestTimeout(20 * 60 * 1000));
app.use('/api/admin/majcat-grid/upload', requestTimeout(15 * 60 * 1000));
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/model-generation/bulk/')) return next();
  if (req.path.startsWith('/admin/majcat-grid/upload')) return next();
  return requestTimeout(90 * 1000)(req, res, next);
});

app.use((req, res, next) => {
  if (!isAppShuttingDown()) {
    next();
    return;
  }

  res.setHeader('Connection', 'close');
  res.status(503).json({
    success: false,
    error: 'Server is shutting down. Please retry in a few seconds.',
    code: 'SERVER_SHUTTING_DOWN'
  });
});

// Serve uploaded images as static files
app.use('/uploads', express.static('uploads'));

// Serve frontend static files in production (built into public/ during CI)
if (isProduction) {
  app.use(express.static(path.join(__dirname, '../public')));
}

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
// Uses custom rate limiter: 500 requests per 15 minutes (more lenient for edit-on-card)
// ═══════════════════════════════════════════════════════
app.use('/api/approver', authenticate, approverLimiter, auditLog, approverRoutes);

// ═══════════════════════════════════════════════════════
// WATCHER ROUTES (External file-watcher service only)
// Secured by X-Watcher-Key header, NOT JWT
// ═══════════════════════════════════════════════════════
app.use('/api/watcher', authenticateWatcher, watcherRoutes); // TODO: Add requireApprover middleware
app.use('/api/article-config', authenticate, articleConfigRoutes);
app.use('/api/model-generation', authenticate, requireUser, modelGenerationRoutes);

// Health check endpoint (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route — serves frontend in production, API info in development
app.get('/', async (req, res) => {
  if (isProduction) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
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

// SPA catch-all: all non-API routes serve index.html so React Router works
if (isProduction) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Async initialization and server start
(async () => {
  try {
    // ── Environment variable audit ────────────────────────────────────────
    const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];
    const OPTIONAL_VARS = ['REDIS_URL', 'ENABLE_REDIS', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'R2_ACCESS_KEY_ID', 'ZMM_RFC_URL'];
    const missing = REQUIRED_VARS.filter(k => !process.env[k]);
    const present = [...REQUIRED_VARS, ...OPTIONAL_VARS].filter(k => !!process.env[k]);
    if (missing.length > 0) {
      console.error(`❌ MISSING REQUIRED ENV VARS: ${missing.join(', ')}`);
      console.error('   Set these in Azure Portal → Configuration → Application Settings');
    } else {
      console.log(`✅ Required env vars present: ${REQUIRED_VARS.join(', ')}`);
    }
    console.log(`ℹ️  Optional env vars present: ${present.filter(k => OPTIONAL_VARS.includes(k)).join(', ') || 'none'}`);

    // ── Database connectivity test ────────────────────────────────────────
    try {
      const { getPrismaClient } = await import('./utils/prisma');
      const dbClient = getPrismaClient();
      await dbClient.$queryRaw`SELECT 1`;
      console.log('✅ Database connection verified');
    } catch (dbErr: any) {
      console.error('❌ Database connection FAILED:', dbErr?.message);
      console.error('   Check DATABASE_URL in Azure App Settings. App will start but all DB routes will fail.');
    }

    // Initialize MVGR Mapping Service
    await mvgrMappingService.initialize();
    const mvgrStats = mvgrMappingService.getStats();
    console.log(`✅ MVGR Mapping Service initialized:
   - Macro MVGR: ${mvgrStats.macroMvgrCount} mappings
   - Main MVGR: ${mvgrStats.mainMvgrCount} mappings
   - Weave2: ${mvgrStats.weave2Count} mappings`);

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

    // Run backfills once in the background — does not block startup
    ApproverController.runStartupBackfills();

    // SRM Sync Scheduler — fires at 12:00 PM and 8:00 PM IST (UTC+5:30) daily.
    // Replaces the external watcher cron that previously called POST /api/watcher/sync-srm.
    let lastSrmSyncKey = '';
    setInterval(() => {
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const h = istNow.getUTCHours();
      const m = istNow.getUTCMinutes();
      if (m === 0 && (h === 12 || h === 20)) {
        const key = `${istNow.toISOString().slice(0, 10)}-${h}`;
        if (key !== lastSrmSyncKey) {
          lastSrmSyncKey = key;
          console.log(`[SRM Cron] Starting scheduled sync at IST ${h}:00`);
          syncFromSrm()
            .then(r => console.log(`[SRM Cron] Sync complete — inserted:${r.inserted} skipped:${r.skipped} errors:${r.errors}`))
            .catch(err => console.error('[SRM Cron] Sync failed:', err?.message));
        }
      }
    }, 60_000);

    // Vendor Master Sync Scheduler — fires once daily at 2:00 AM IST (UTC+5:30).
    let lastVendorSyncKey = '';
    setInterval(() => {
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const h = istNow.getUTCHours();
      const m = istNow.getUTCMinutes();
      if (m === 0 && h === 2) {
        const key = istNow.toISOString().slice(0, 10); // one run per calendar day
        if (key !== lastVendorSyncKey) {
          lastVendorSyncKey = key;
          console.log('[VendorMaster Cron] Starting scheduled sync at IST 02:00');
          syncVendorMaster()
            .then(r => console.log(`[VendorMaster Cron] Sync complete — upserted:${r.upserted} pages:${r.pages} duration:${r.durationMs}ms`))
            .catch(err => console.error('[VendorMaster Cron] Sync failed:', err?.message));
        }
      }
    }, 60_000);

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Backend running on PORT: ${PORT}`);
      console.log(`   User:    POST /api/user/extract/*, GET /api/user/categories/*`);
      console.log(`   Admin:   /api/admin/* (requires ADMIN role)`);
      console.log(`\n⚠️  Note: Legacy routes /api/extract/*, /api/vlm/* require authentication`);
    });

    const shutdown = async (signal: 'SIGTERM' | 'SIGINT') => {
      if (shutdownInProgress) {
        return;
      }

      shutdownInProgress = true;
      setAppIsShuttingDown(true);
      console.log(signal === 'SIGINT'
        ? '\n🔄 SIGINT received, shutting down gracefully...'
        : '🔄 SIGTERM received, shutting down gracefully...');

      try {
        await flushAuditLogsOnShutdown();
      } catch (error) {
        console.error('❌ Failed to flush audit logs during shutdown:', error);
      }

      server.close(async () => {
        try {
          await cacheService.disconnect();
        } catch (error) {
          console.error('❌ Failed to disconnect Redis during shutdown:', error);
        }

        try {
          await disconnectPrismaClient();
        } catch (error) {
          console.error('❌ Failed to disconnect Prisma during shutdown:', error);
        }

        console.log('✅ Server closed');
        process.exit(0);
      });
    };

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (error) {
    console.error('❌ Error during server initialization:', error);
    process.exit(1);
  }
})();

export default app;
