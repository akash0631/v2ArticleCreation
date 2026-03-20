# Network Access Setup Guide

## Overview
This guide explains how to make your AI Fashion Extractor application accessible on your network at `http://192.168.151.46:5173` and `http://192.168.151.46:5000`.

## Prerequisites
- Your machine IP: `192.168.151.46`
- Frontend Port: `5173`
- Backend Port: `5000`
- Both machines on the same network

## Step 1: Start the Backend

Navigate to the Backend directory and install dependencies:

```bash
cd Backend
npm install
```

Start the backend in development mode with network access:

```bash
npm run dev
```

The backend will listen on `0.0.0.0:5000` (accessible on all network interfaces).

You can verify it's running at:
- `http://localhost:5000` (local access)
- `http://192.168.151.46:5000` (network access)

## Step 2: Configure Frontend Environment

Update the Frontend `.env` file to point to the backend on your network IP:

```env
# Frontend Environment Configuration
# For network access, point to your machine's IP
VITE_API_BASE_URL=http://192.168.151.46:5000/api
```

**Alternative:** You can keep it as `localhost:5000` if accessing from the same machine.

## Step 3: Start the Frontend

Navigate to the Frontend directory and install dependencies:

```bash
cd Frontend
npm install
```

Start the frontend with network access enabled:

```bash
npm run dev -- --host
```

The frontend will be accessible at:
- `http://localhost:5173` (local access)
- `http://192.168.151.46:5173` (network access)

## Step 4: Access the Application

From another machine on the same network, open your browser and navigate to:
```
http://192.168.151.46:5173
```

## Configuration Changes Made

### Frontend (vite.config.ts)
- Added `server` configuration with `host: '0.0.0.0'`
- Configured port to `5173`
- Set `strictPort: false` to use next available port if 5173 is taken

### Backend (src/index.ts)
- Updated server to listen on `0.0.0.0` instead of default localhost-only
- CORS is already configured to allow `192.168.x.x` addresses in development

## Troubleshooting

### Can't access from network?
1. Ensure firewall allows ports 5000 and 5173
2. Check that both services are running: `npm run dev`
3. Verify your network IP matches `192.168.151.46`
4. Ensure frontend `.env` points to correct backend IP

### CORS Error?
- Backend already has CORS configured for `192.168.x.x` addresses
- If error persists, check `Backend/src/index.ts` CORS configuration

### Connection refused?
- Ensure backend is running with `npm run dev` on port 5000
- Check if port 5000 is already in use: `netstat -ano | findstr :5000`

## Quick Start Command

Open two terminals in the project root:

**Terminal 1 (Backend):**
```bash
cd Backend && npm install && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd Frontend && npm install && npm run dev -- --host
```

Then access at: `http://192.168.151.46:5173`

## Security Notes

- In development, localhost and `192.168.x.x` addresses are allowed
- In production, configure `CORS_ORIGINS` and `FRONTEND_URL` environment variables
- API endpoints require authentication (see API docs)
