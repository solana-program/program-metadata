import {
    createDefaultRpcTransport,
    createSolanaRpcFromTransport,
    isSolanaError,
    Rpc,
    RpcTransport,
    SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
    SolanaRpcApi,
} from '@solana/kit';

/** The maximum number of retries attempted for a rate-limited request. */
const DEFAULT_MAX_RETRIES = 5;
/** The base delay, in milliseconds, used for exponential backoff. */
const BASE_BACKOFF_MS = 500;
/** The ceiling, in milliseconds, applied to any computed backoff delay. */
const MAX_BACKOFF_MS = 10_000;

/**
 * Options controlling how {@link createRetryingSolanaRpc} retries rate-limited
 * requests.
 */
export type RetryingRpcConfig = {
    /**
     * Optional configuration forwarded to the underlying default RPC transport,
     * such as custom headers.
     */
    transportConfig?: Omit<Parameters<typeof createDefaultRpcTransport>[0], 'url'>;
    /**
     * The maximum number of retries attempted after an initial rate-limited
     * (HTTP 429) response before giving up. Defaults to {@link DEFAULT_MAX_RETRIES}.
     */
    maxRetries?: number;
    /**
     * Sleep function used between retries. Injectable for testing; defaults to a
     * `setTimeout`-based delay.
     */
    sleep?: (ms: number) => Promise<void>;
};

/**
 * Creates a Solana RPC client whose transport automatically retries requests
 * that fail with an HTTP 429 (Too Many Requests) response.
 *
 * Public RPC endpoints — devnet in particular — aggressively rate-limit bursts
 * of requests. Since uploading metadata fans a large payload out into many
 * write transactions (each performing several RPC calls), those bursts commonly
 * trip the rate limiter and abort the whole upload. Retrying at the transport
 * layer covers every RPC call (blockhash lookups, simulations, sends and status
 * polls), not just the sends.
 *
 * The retry honours the server's `Retry-After` header when present; otherwise it
 * falls back to exponential backoff with jitter. Only HTTP 429 responses are
 * retried — every other error propagates immediately so genuine failures are
 * surfaced without delay.
 *
 * @param url - The Solana RPC endpoint URL.
 * @param config - Optional retry and transport configuration.
 * @returns An {@link Rpc} backed by the retrying transport.
 */
export function createRetryingSolanaRpc(url: string, config: RetryingRpcConfig = {}): Rpc<SolanaRpcApi> {
    const baseTransport = createDefaultRpcTransport({ url, ...config.transportConfig });
    return createSolanaRpcFromTransport(withRateLimitRetries(baseTransport, config));
}

/**
 * Wraps a transport so that requests failing with an HTTP 429 (Too Many
 * Requests) response are retried. Exposed separately from
 * {@link createRetryingSolanaRpc} so the retry behaviour can be tested against a
 * mock transport without performing real network I/O.
 *
 * @param transport - The underlying transport to wrap.
 * @param config - Optional retry configuration.
 * @returns A transport that retries rate-limited requests.
 */
export function withRateLimitRetries(transport: RpcTransport, config: RetryingRpcConfig = {}): RpcTransport {
    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const sleep = config.sleep ?? defaultSleep;

    return async <TResponse>(request: Parameters<RpcTransport>[0]): Promise<TResponse> => {
        for (let attempt = 0; ; attempt++) {
            try {
                return await transport<TResponse>(request);
            } catch (error) {
                if (attempt >= maxRetries || !isRateLimitError(error)) {
                    throw error;
                }
                await sleep(getRetryDelayMs(error, attempt));
            }
        }
    };
}

/** Returns whether the given error is an HTTP 429 (rate limit) transport error. */
function isRateLimitError(error: unknown): boolean {
    return isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) && error.context.statusCode === 429;
}

/**
 * Computes how long to wait before retrying a rate-limited request.
 *
 * Prefers the server-provided `Retry-After` header (supporting both the
 * delay-seconds and HTTP-date forms) and falls back to exponential backoff with
 * full jitter, capped at {@link MAX_BACKOFF_MS}.
 */
export function getRetryDelayMs(error: unknown, attempt: number): number {
    const retryAfter = getRetryAfterMs(error);
    if (retryAfter !== null) {
        return Math.min(retryAfter, MAX_BACKOFF_MS);
    }
    const exponential = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    // Full jitter: a random delay in [0, exponential] to spread out retries and
    // avoid a thundering herd against the rate limiter.
    return Math.round(Math.random() * exponential);
}

/**
 * Parses the `Retry-After` header from a rate-limit error into milliseconds, or
 * returns `null` when the header is absent or unparseable.
 */
function getRetryAfterMs(error: unknown): number | null {
    if (!isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) {
        return null;
    }
    const headerValue = error.context.headers?.get('retry-after');
    if (!headerValue) {
        return null;
    }

    // `Retry-After` may be a number of seconds or an HTTP-date.
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }
    const dateMs = Date.parse(headerValue);
    if (Number.isFinite(dateMs)) {
        return Math.max(0, dateMs - Date.now());
    }
    return null;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
