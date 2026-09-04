import { RpcTransport, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, SolanaError } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { getBackoffDelayMs, getRetryDecision, withRateLimitRetries } from '../src/cli/rpc';

/** Builds an HTTP transport error matching what the default transport throws. */
function httpError(statusCode: number, headers: Record<string, string> = {}): SolanaError {
    return new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, {
        headers: new Headers(headers),
        message: statusCode === 429 ? 'Too Many Requests' : 'Server Error',
        statusCode,
    });
}

const noSleep = () => Promise.resolve();

/**
 * Builds a mock {@link RpcTransport} that replays the given behaviours in order,
 * throwing entries that are `Error`s and resolving anything else. The trailing
 * behaviour is reused once the queue is exhausted, so a single entry acts as a
 * transport that always behaves that way. Tracks its call count via `calls`.
 */
function mockTransport(...behaviours: unknown[]): RpcTransport & { calls: number } {
    const fn = (): Promise<unknown> => {
        const behaviour = behaviours[Math.min(transport.calls, behaviours.length - 1)];
        transport.calls++;
        return behaviour instanceof Error ? Promise.reject(behaviour) : Promise.resolve(behaviour);
    };
    const transport = fn as unknown as RpcTransport & { calls: number };
    transport.calls = 0;
    return transport;
}

describe('withRateLimitRetries', () => {
    it('retries a rate-limited request until it succeeds', async () => {
        // Given a transport that fails with 429 twice, then succeeds.
        const inner = mockTransport(httpError(429), httpError(429), 'ok');
        const transport = withRateLimitRetries(inner, { sleep: noSleep });

        // When we send a request through the retrying transport.
        const result = await transport({ payload: {} });

        // Then it retries and eventually resolves with the successful response.
        expect(result).toBe('ok');
        expect(inner.calls).toBe(3);
    });

    it('propagates non-429 errors immediately without retrying', async () => {
        // Given a transport that fails with a 500 server error.
        const inner = mockTransport(httpError(500));
        const transport = withRateLimitRetries(inner, { sleep: noSleep });

        // When we send a request, then the error propagates on the first attempt.
        await expect(transport({ payload: {} })).rejects.toThrow('HTTP error (500)');
        expect(inner.calls).toBe(1);
    });

    it('propagates non-Solana errors immediately without retrying', async () => {
        // Given a transport that fails with a generic error.
        const inner = mockTransport(new Error('boom'));
        const transport = withRateLimitRetries(inner, { sleep: noSleep });

        // When we send a request, then the error propagates on the first attempt.
        await expect(transport({ payload: {} })).rejects.toThrow('boom');
        expect(inner.calls).toBe(1);
    });

    it('gives up after the configured number of retries', async () => {
        // Given a transport that always returns 429.
        const inner = mockTransport(httpError(429));
        const transport = withRateLimitRetries(inner, { maxRetries: 3, sleep: noSleep });

        // When we send a request, then it throws after exhausting the retries.
        await expect(transport({ payload: {} })).rejects.toThrow('HTTP error (429)');
        // 1 initial attempt + 3 retries.
        expect(inner.calls).toBe(4);
    });

    it('waits between retries using the injected sleep function', async () => {
        // Given a transport that fails once with 429, then succeeds.
        const inner = mockTransport(httpError(429), 'ok');
        const sleep = vi.fn(() => Promise.resolve());
        const transport = withRateLimitRetries(inner, { sleep });

        // When we send a request, then sleep is invoked once before the retry.
        await transport({ payload: {} });
        expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('gives up when the server asks to wait longer than the ceiling', async () => {
        // Given a transport that returns 429 with a two-minute Retry-After.
        const inner = mockTransport(httpError(429, { 'retry-after': '120' }));
        const sleep = vi.fn(() => Promise.resolve());
        const transport = withRateLimitRetries(inner, { sleep });

        // When we send a request, then it throws immediately without sleeping.
        await expect(transport({ payload: {} })).rejects.toThrow('HTTP error (429)');
        expect(inner.calls).toBe(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('invokes onRetry before each retry with the retry details', async () => {
        // Given a transport that fails twice with 429, then succeeds.
        const inner = mockTransport(httpError(429), httpError(429), 'ok');
        const onRetry = vi.fn();
        const transport = withRateLimitRetries(inner, { onRetry, sleep: noSleep });

        // When we send a request, then onRetry is called once per retry.
        await transport({ payload: {} });
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 0 }));
        expect(onRetry).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 1 }));
        expect(onRetry.mock.calls[0][0]).toMatchObject({
            delayMs: expect.any(Number),
            error: expect.any(SolanaError),
        });
    });

    it('stops retrying once the request is aborted mid-backoff', async () => {
        // Given a transport that always returns 429 and a signal that aborts
        // while the wrapper is waiting to retry after the first failure.
        const inner = mockTransport(httpError(429));
        const controller = new AbortController();
        const sleep = vi.fn((_ms: number, _signal?: AbortSignal) => {
            controller.abort();
            return Promise.resolve();
        });
        const transport = withRateLimitRetries(inner, { maxRetries: 5, sleep });

        // When we send a request with the abortable signal, then after the first
        // failure and single backoff the loop notices the abort and throws the
        // original 429 without making a second transport call.
        await expect(transport({ payload: {}, signal: controller.signal })).rejects.toThrow('HTTP error (429)');
        expect(sleep).toHaveBeenCalledTimes(1);
        expect(inner.calls).toBe(1);
    });
});

describe('getRetryDecision', () => {
    it('gives up on non-429 errors', () => {
        expect(getRetryDecision(httpError(500), 0, 5)).toEqual({ kind: 'give-up' });
    });

    it('gives up once the retry budget is exhausted', () => {
        expect(getRetryDecision(httpError(429), 5, 5)).toEqual({ kind: 'give-up' });
    });

    it('honours a numeric Retry-After header in seconds', () => {
        expect(getRetryDecision(httpError(429, { 'retry-after': '2' }), 0, 5)).toEqual({
            kind: 'retry',
            delayMs: 2000,
        });
    });

    it('honours an HTTP-date Retry-After header', () => {
        const twoSecondsFromNow = new Date(Date.now() + 2000).toUTCString();
        const decision = getRetryDecision(httpError(429, { 'retry-after': twoSecondsFromNow }), 0, 5);
        expect(decision.kind).toBe('retry');
        // Allow a small margin for clock drift during the test.
        expect(decision.kind === 'retry' && decision.delayMs).toBeGreaterThan(0);
        expect(decision.kind === 'retry' && decision.delayMs).toBeLessThanOrEqual(2000);
    });

    it('gives up when Retry-After exceeds the ceiling', () => {
        expect(getRetryDecision(httpError(429, { 'retry-after': '120' }), 0, 5)).toEqual({ kind: 'give-up' });
    });

    it('falls back to jittered exponential backoff for an unparseable Retry-After', () => {
        const decision = getRetryDecision(httpError(429, { 'retry-after': 'soon' }), 0, 5);
        expect(decision.kind).toBe('retry');
        // Attempt 0 backoff is bounded by the base delay (500ms).
        expect(decision.kind === 'retry' && decision.delayMs).toBeGreaterThanOrEqual(0);
        expect(decision.kind === 'retry' && decision.delayMs).toBeLessThanOrEqual(500);
    });

    it('falls back to jittered exponential backoff when no header is present', () => {
        const decision = getRetryDecision(httpError(429), 2, 5);
        expect(decision.kind).toBe('retry');
        // Attempt 2 backoff is bounded by base (500ms) * 2 ** 2 = 2000ms.
        expect(decision.kind === 'retry' && decision.delayMs).toBeGreaterThanOrEqual(0);
        expect(decision.kind === 'retry' && decision.delayMs).toBeLessThanOrEqual(2000);
    });
});

describe('getBackoffDelayMs', () => {
    it('stays within the jittered exponential ceiling for each attempt', () => {
        // With full jitter, the delay is bounded by the exponential ceiling for
        // the attempt: base (500ms) * 2 ** attempt, capped at the maximum.
        for (let attempt = 0; attempt < 6; attempt++) {
            const delay = getBackoffDelayMs(attempt);
            const ceiling = Math.min(500 * 2 ** attempt, 10_000);
            expect(delay).toBeGreaterThanOrEqual(0);
            expect(delay).toBeLessThanOrEqual(ceiling);
        }
    });
});
