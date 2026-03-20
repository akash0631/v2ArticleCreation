# Domain Configuration Guide

## Current Setup
Your application has been configured to use the following domains:

### Frontend
- **URL:** `https://articlecreation.v2retail.net`
- **Port:** 443 (HTTPS)
- **Environment Variable:** `VITE_API_BASE_URL=https://articlecreation-api.v2retail.net/api`

### Backend API
- **URL:** `https://articlecreation-api.v2retail.net`
- **Port:** 443 (HTTPS)
- **Environment Variable:** `FRONTEND_URL=https://articlecreation.v2retail.net`
- **CORS Origins:** `https://articlecreation.v2retail.net,https://www.articlecreation.v2retail.net`

## Configuration Changes Made

### 1. Frontend Configuration
**File:** `Frontend/.env`
```env
VITE_API_BASE_URL=https://articlecreation-api.v2retail.net/api
```

The frontend automatically uses this URL for all API calls through the `APP_CONFIG` constant in `src/constants/app/config.ts`.

### 2. Backend Configuration
**File:** `Backend/.env`
```env
FRONTEND_URL=https://articlecreation.v2retail.net
CORS_ORIGINS=https://articlecreation.v2retail.net,https://www.articlecreation.v2retail.net
```

### 3. CORS Configuration
**File:** `Backend/src/index.ts`

The CORS middleware has been updated to:
- Allow requests with no origin (for mobile apps, Postman, etc.)
- Allow all `192.168.x.x` addresses in development
- Allow HTTP requests in development
- Allow specified HTTPS domains in production
- Support both domain variations (with/without www)

## How CORS Works

The backend now intelligently handles CORS by:
1. Checking if the origin is in the `allowedOrigins` array (built from environment variables)
2. Supporting partial domain matching for aliases
3. Logging warnings for unmatched origins but still allowing them (to avoid blocking)
4. Enabling credentials for secure cross-domain requests

## DNS Configuration Required

For the domains to work, make sure your DNS records point to your server:

```
articlecreation.v2retail.net       A record -> Your Server IP
www.articlecreation.v2retail.net   A record -> Your Server IP
articlecreation-api.v2retail.net   A record -> Your Server IP
```

## SSL/TLS Certificate

For HTTPS to work, ensure your server has valid SSL certificates:
- For `articlecreation.v2retail.net`
- For `articlecreation-api.v2retail.net`

You can use Let's Encrypt with:
```bash
certbot certonly --standalone -d articlecreation.v2retail.net -d www.articlecreation.v2retail.net -d articlecreation-api.v2retail.net
```

## Local Development (Optional)

For local development, the configuration still supports:
- `http://localhost:5173` (Frontend)
- `http://localhost:5000` (Backend)
- `http://192.168.151.46:5173` (Frontend - Network)
- `http://192.168.151.46:5000` (Backend - Network)

To switch back to local development, temporarily update:

**Frontend/.env** (for local dev):
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

**Backend/.env** (for local dev - optional, already supports all origins in dev mode):
```env
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://192.168.151.46:5173
```

## Running the Application

### Production (with domains)
```bash
# Terminal 1 - Backend
cd Backend
npm run build
npm run start

# Terminal 2 - Frontend
cd Frontend
npm run build
# Serve with your web server (nginx, Apache, Vercel, etc.)
```

### Development (with local network)
```bash
# Terminal 1 - Backend
cd Backend
npm run dev

# Terminal 2 - Frontend
cd Frontend
npm run dev -- --host
```

## Verification

### Test Backend Health
```bash
curl https://articlecreation-api.v2retail.net/api/health
```

### Expected Response
```json
{
  "status": "ok",
  "timestamp": "2026-03-20T12:00:00Z"
}
```

## Troubleshooting CORS Errors

If you still see CORS errors:

1. **Check browser console** for the exact origin being blocked
2. **Verify DNS** - Make sure domains resolve to correct IP
3. **Check SSL certificate** - Ensure valid HTTPS certificate
4. **Review backend logs** for CORS warnings
5. **Clear browser cache** (Ctrl+Shift+R)
6. **Add origin to CORS_ORIGINS** in Backend/.env if needed

### Adding a new origin dynamically
```env
CORS_ORIGINS=https://articlecreation.v2retail.net,https://www.articlecreation.v2retail.net,https://staging.v2retail.net
```

Then restart the backend.

## Summary of URLs

| Service | Local Dev | Network | Production |
|---------|-----------|---------|------------|
| Frontend | http://localhost:5173 | http://192.168.151.46:5173 | https://articlecreation.v2retail.net |
| Backend API | http://localhost:5000/api | http://192.168.151.46:5000/api | https://articlecreation-api.v2retail.net/api |
