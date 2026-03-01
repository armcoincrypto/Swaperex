/**
 * Swaperex Signals Backend
 *
 * Fastify server providing read-only signal APIs.
 * Philosophy: Backend must increase trust, not add noise.
 *
 * Signals:
 * - Liquidity Drop: Detects ≥30% drop in <10 minutes
 * - Whale Transfer: Detects large transfers > threshold USD
 * - Risk Change: Detects token risk level changes
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { signalsRoutes } from './api/signals.js';
import cache from './cache/redis.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  // Add production domains here
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

async function main() {
  // Initialize Fastify
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Check if origin is allowed
      if (ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost')) {
        cb(null, true);
        return;
      }

      cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: true,
  });

  // Register routes
  await fastify.register(signalsRoutes);

  // Startup
  try {
    // Initialize cache
    await cache.init();
    fastify.log.info('Cache initialized');

    // Start server
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`🚀 Swaperex Signals API running on http://${HOST}:${PORT}`);
    fastify.log.info('Available endpoints:');
    fastify.log.info('  GET /api/health - Health check');
    fastify.log.info('  GET /api/signals?chainId=1&token=0x... - All signals');
    fastify.log.info('  GET /api/signals/liquidity?chainId=1&token=0x...');
    fastify.log.info('  GET /api/signals/whale?chainId=1&token=0x...');
    fastify.log.info('  GET /api/signals/risk?chainId=1&token=0x...');
    fastify.log.info('  GET /api/signals/security?chainId=1&token=0x...');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}. Shutting down...`);
    await fastify.close();
    await cache.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
