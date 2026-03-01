import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout } from '../fetchWithTimeout';

// All tests use real timers — timeout tests use short timeouts (50ms)
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function okResponse(body: object = { ok: true }): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function errorResponse(status: number): Response {
  return new Response('error', { status });
}

describe('fetchWithTimeout', () => {
  it('returns response on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api', {}, { timeoutMs: 5000 });
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes init options to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', mockFetch);

    const headers = { Authorization: 'Bearer test' };
    await fetchWithTimeout('https://example.com/api', { method: 'GET', headers });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ method: 'GET', headers }),
    );
  });

  it('aborts and throws on timeout', async () => {
    // Simulate a slow fetch that responds to abort signal
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
          if (init.signal.aborted) { onAbort(); return; }
          init.signal.addEventListener('abort', onAbort);
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithTimeout('https://example.com/api', {}, {
        timeoutMs: 50,
        retries: 0,
        provider: 'TestProvider',
      }),
    ).rejects.toThrow('TestProvider: Request timed out');
  });

  it('retries on 429 and returns final response', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api', {}, {
      retries: 1,
      retryOn: [429],
    });

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and returns error if retries exhausted', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500));
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api', {}, {
      retries: 1,
      retryOn: [500],
    });

    expect(response.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 400 (non-retryable)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(errorResponse(400));
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api', {}, {
      retries: 1,
    });

    expect(response.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and throws if exhausted', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(new Error('Failed to fetch'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithTimeout('https://example.com/api', {}, {
        retries: 1,
        provider: '1inch',
      }),
    ).rejects.toThrow('1inch: Network error: Failed to fetch');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('includes provider name in timeout error message', async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
          if (init.signal.aborted) { onAbort(); return; }
          init.signal.addEventListener('abort', onAbort);
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithTimeout('https://example.com/api', {}, {
        timeoutMs: 50,
        retries: 0,
        provider: 'PancakeSwap',
      }),
    ).rejects.toThrow('PancakeSwap: Request timed out');
  });

  it('uses default options when none provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api');
    expect(response.status).toBe(200);
  });

  it('retries network errors and succeeds on retry', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('DNS failure'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', mockFetch);

    const response = await fetchWithTimeout('https://example.com/api', {}, {
      retries: 1,
    });

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
