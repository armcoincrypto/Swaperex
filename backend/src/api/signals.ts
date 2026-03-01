/**
 * Signals API Routes
 *
 * Provides read-only endpoints for token signals.
 * Philosophy: Increase trust, not noise. No trading logic, no predictions.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkLiquidityDrop } from '../signals/liquidity.js';
import { checkWhaleTransfer } from '../signals/whale.js';
import { checkRiskChange, getTokenSecurity } from '../signals/risk.js';
import type { SignalsResponse } from '../signals/types.js';

// Query parameters schema
interface SignalsQuery {
  chainId: string;
  token: string;
}

// Validate Ethereum address format
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate chain ID
const SUPPORTED_CHAINS = [1, 56, 137, 42161, 10, 43114, 250, 8453];

function isValidChainId(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}

/**
 * Register signals routes
 */
export async function signalsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/signals
   *
   * Returns all signals for a token on a chain.
   * Query params: chainId, token
   */
  fastify.get<{ Querystring: SignalsQuery }>(
    '/api/signals',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['chainId', 'token'],
          properties: {
            chainId: { type: 'string' },
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              chainId: { type: 'number' },
              token: { type: 'string' },
              signals: {
                type: 'object',
                properties: {
                  liquidityDrop: { type: 'object', nullable: true },
                  whaleTransfer: { type: 'object', nullable: true },
                  riskChange: { type: 'object', nullable: true },
                },
              },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: SignalsQuery }>,
      reply: FastifyReply
    ) => {
      const { chainId: chainIdStr, token } = request.query;
      const chainId = parseInt(chainIdStr, 10);

      // Validate inputs
      if (isNaN(chainId) || !isValidChainId(chainId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid chainId. Supported: 1, 56, 137, 42161, 10, 43114, 250, 8453',
        });
      }

      if (!isValidAddress(token)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid token address format',
        });
      }

      try {
        // Fetch all signals in parallel
        const [liquidityDrop, whaleTransfer, riskChange] = await Promise.all([
          checkLiquidityDrop(chainId, token),
          checkWhaleTransfer(chainId, token),
          checkRiskChange(chainId, token),
        ]);

        const response: SignalsResponse = {
          success: true,
          chainId,
          token: token.toLowerCase(),
          signals: {
            liquidityDrop,
            whaleTransfer,
            riskChange,
          },
          timestamp: Date.now(),
        };

        return reply.send(response);
      } catch (err) {
        fastify.log.error(err, 'Error fetching signals');
        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch signals',
        });
      }
    }
  );

  /**
   * GET /api/signals/liquidity
   *
   * Returns only liquidity signal for a token.
   */
  fastify.get<{ Querystring: SignalsQuery }>(
    '/api/signals/liquidity',
    async (request, reply) => {
      const { chainId: chainIdStr, token } = request.query as SignalsQuery;
      const chainId = parseInt(chainIdStr, 10);

      if (isNaN(chainId) || !isValidChainId(chainId) || !isValidAddress(token)) {
        return reply.status(400).send({ success: false, error: 'Invalid parameters' });
      }

      try {
        const signal = await checkLiquidityDrop(chainId, token);
        return reply.send({ success: true, chainId, token, signal, timestamp: Date.now() });
      } catch (err) {
        return reply.status(500).send({ success: false, error: 'Failed to fetch liquidity signal' });
      }
    }
  );

  /**
   * GET /api/signals/whale
   *
   * Returns only whale transfer signal for a token.
   */
  fastify.get<{ Querystring: SignalsQuery }>(
    '/api/signals/whale',
    async (request, reply) => {
      const { chainId: chainIdStr, token } = request.query as SignalsQuery;
      const chainId = parseInt(chainIdStr, 10);

      if (isNaN(chainId) || !isValidChainId(chainId) || !isValidAddress(token)) {
        return reply.status(400).send({ success: false, error: 'Invalid parameters' });
      }

      try {
        const signal = await checkWhaleTransfer(chainId, token);
        return reply.send({ success: true, chainId, token, signal, timestamp: Date.now() });
      } catch (err) {
        return reply.status(500).send({ success: false, error: 'Failed to fetch whale signal' });
      }
    }
  );

  /**
   * GET /api/signals/risk
   *
   * Returns only risk change signal for a token.
   */
  fastify.get<{ Querystring: SignalsQuery }>(
    '/api/signals/risk',
    async (request, reply) => {
      const { chainId: chainIdStr, token } = request.query as SignalsQuery;
      const chainId = parseInt(chainIdStr, 10);

      if (isNaN(chainId) || !isValidChainId(chainId) || !isValidAddress(token)) {
        return reply.status(400).send({ success: false, error: 'Invalid parameters' });
      }

      try {
        const signal = await checkRiskChange(chainId, token);
        return reply.send({ success: true, chainId, token, signal, timestamp: Date.now() });
      } catch (err) {
        return reply.status(500).send({ success: false, error: 'Failed to fetch risk signal' });
      }
    }
  );

  /**
   * GET /api/signals/security
   *
   * Returns detailed security data for a token (GoPlus).
   */
  fastify.get<{ Querystring: SignalsQuery }>(
    '/api/signals/security',
    async (request, reply) => {
      const { chainId: chainIdStr, token } = request.query as SignalsQuery;
      const chainId = parseInt(chainIdStr, 10);

      if (isNaN(chainId) || !isValidChainId(chainId) || !isValidAddress(token)) {
        return reply.status(400).send({ success: false, error: 'Invalid parameters' });
      }

      try {
        const security = await getTokenSecurity(chainId, token);
        return reply.send({ success: true, chainId, token, security, timestamp: Date.now() });
      } catch (err) {
        return reply.status(500).send({ success: false, error: 'Failed to fetch security data' });
      }
    }
  );

  /**
   * GET /api/health
   *
   * Health check endpoint.
   */
  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'swaperex-signals',
      version: '1.0.0',
      timestamp: Date.now(),
    });
  });
}

export default signalsRoutes;
