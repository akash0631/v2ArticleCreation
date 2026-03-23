/**
 * Singleton Prisma Client for Supabase
 * 
 * Handles connection pooling properly to avoid "Server has closed the connection" errors
 * with Supabase's pgBouncer.
 */

import { PrismaClient } from '../generated/prisma';

// Global singleton (survives hot-reload in development)
type GlobalWithPrisma = typeof globalThis & {
  __prismaClient?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

function buildRuntimeDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);

    // When using Supabase shared pooler, force safer Prisma pooling settings.
    if (parsed.hostname.includes('pooler.supabase.com')) {
      if (!parsed.searchParams.has('pgbouncer')) {
        parsed.searchParams.set('pgbouncer', 'true');
      }
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '1');
      }
      if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', '20');
      }
      if (!parsed.searchParams.has('connect_timeout')) {
        parsed.searchParams.set('connect_timeout', '20');
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017']);

function isTransientPrismaError(error: any): boolean {
  const code = error?.code as string | undefined;
  const message = String(error?.message || '').toLowerCase();

  if (code && TRANSIENT_PRISMA_CODES.has(code)) {
    return true;
  }

  return (
    message.includes('connection reset') ||
    message.includes('forcibly closed by the remote host') ||
    message.includes('server has closed the connection') ||
    message.includes('can\'t reach database server')
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resetPrismaClient(): Promise<void> {
  if (globalForPrisma.__prismaClient) {
    try {
      await globalForPrisma.__prismaClient.$disconnect();
    } catch {
      // Ignore disconnect errors during reset
    }
    globalForPrisma.__prismaClient = undefined;
  }
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 250;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      const canRetry = attempt < maxRetries && isTransientPrismaError(error);
      if (!canRetry) {
        throw error;
      }

      await resetPrismaClient();
      getPrismaClient();
      await wait(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw lastError;
}

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__prismaClient) {
    globalForPrisma.__prismaClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: buildRuntimeDatabaseUrl()
        }
      }
    });

    // Handle graceful shutdown
    process.on('beforeExit', async () => {
      await globalForPrisma.__prismaClient?.$disconnect();
    });
  }

  return globalForPrisma.__prismaClient;
}

// Export singleton instance
export const prismaClient = getPrismaClient();
