"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseRestClient = exports.SupabaseRestError = void 0;
class SupabaseRestError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name = 'SupabaseRestError';
        this.status = status;
        this.code = code;
    }
}
exports.SupabaseRestError = SupabaseRestError;
function normalizeBaseUrl(value) {
    const url = new URL(value.trim());
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
        throw new Error('Supabase URL must use HTTPS except for localhost tests');
    }
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
}
function required(value, name) {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${name} is required`);
    }
    return normalized;
}
function safeErrorCode(value) {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const code = value.code;
    return typeof code === 'string' && code.length <= 128 ? code : undefined;
}
function safeErrorMessage(value, status) {
    if (typeof value === 'object' && value !== null) {
        const record = value;
        for (const candidate of [record.message, record.error_description, record.error]) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim().slice(0, 300);
            }
        }
    }
    return `Supabase request failed with HTTP ${status}`;
}
class SupabaseRestClient {
    constructor(options) {
        this.baseUrl = normalizeBaseUrl(options.supabaseUrl);
        this.apiKey = required(options.apiKey, 'Supabase API key');
        this.accessToken = required(options.accessToken, 'Supabase access token');
        this.fetchFn = options.fetchFn ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10000;
        this.maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;
        if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 500 || this.timeoutMs > 30000) {
            throw new Error('Supabase request timeout must be between 500 and 30000 milliseconds');
        }
        if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1024 || this.maxResponseBytes > 5 * 1024 * 1024) {
            throw new Error('Supabase response limit must be between 1024 and 5242880 bytes');
        }
    }
    async requestJson(path, init = {}) {
        if (!path.startsWith('/rest/v1/')) {
            throw new Error('Supabase REST paths must begin with /rest/v1/');
        }
        const url = new URL(path, this.baseUrl);
        if (url.origin !== this.baseUrl.origin) {
            throw new Error('Supabase REST request origin mismatch');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const headers = new Headers(init.headers);
            headers.set('apikey', this.apiKey);
            headers.set('authorization', `Bearer ${this.accessToken}`);
            headers.set('accept', 'application/json');
            if (init.body !== undefined && !headers.has('content-type')) {
                headers.set('content-type', 'application/json');
            }
            const response = await this.fetchFn(url, {
                ...init,
                headers,
                signal: controller.signal,
                redirect: 'error',
            });
            const body = new Uint8Array(await response.arrayBuffer());
            if (body.byteLength > this.maxResponseBytes) {
                throw new SupabaseRestError('Supabase response exceeded the configured size limit', 502);
            }
            const text = Buffer.from(body).toString('utf8');
            let parsed = null;
            if (text.trim()) {
                try {
                    parsed = JSON.parse(text);
                }
                catch {
                    throw new SupabaseRestError('Supabase returned invalid JSON', 502);
                }
            }
            if (!response.ok) {
                throw new SupabaseRestError(safeErrorMessage(parsed, response.status), response.status, safeErrorCode(parsed));
            }
            return parsed;
        }
        catch (error) {
            if (error instanceof SupabaseRestError) {
                throw error;
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SupabaseRestError('Supabase request timed out', 504);
            }
            throw new SupabaseRestError('Supabase request failed', 502);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.SupabaseRestClient = SupabaseRestClient;
