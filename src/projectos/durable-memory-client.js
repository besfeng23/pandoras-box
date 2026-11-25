"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOSMemoryClient = exports.ProjectOSMemoryError = void 0;
const zod_1 = require("zod");
const DEFAULT_CONTROL_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 512000;
const FullShaSchema = zod_1.z.string().regex(/^[0-9a-f]{40}$/);
const HashSchema = zod_1.z.string().regex(/^[0-9a-f]{64}$/);
const ProjectKeySchema = zod_1.z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/);
const RepositorySchema = zod_1.z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const StatusSchema = zod_1.z.enum(['active', 'blocked', 'paused', 'complete', 'archived']);
const CheckpointSchema = zod_1.z.object({
    projectKey: ProjectKeySchema,
    version: zod_1.z.number().int().positive(),
    status: StatusSchema,
    phaseKey: zod_1.z.string().nullable().optional(),
    primaryTaskKey: zod_1.z.string().nullable().optional(),
    sourceRepository: RepositorySchema,
    sourceCommitSha: FullShaSchema,
    planVersion: zod_1.z.string().min(1).max(64),
    state: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    stateHash: HashSchema,
    lastEventSequence: zod_1.z.number().int().positive(),
    lastEventHash: HashSchema,
    observedAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
const EventSchema = zod_1.z.object({
    projectKey: ProjectKeySchema,
    sequence: zod_1.z.number().int().positive(),
    checkpointVersion: zod_1.z.number().int().positive(),
    eventType: zod_1.z.string().regex(/^projectos\.[a-z0-9_.-]{1,127}$/),
    runId: zod_1.z.string().uuid().nullable().optional(),
    stepId: zod_1.z.string().uuid().nullable().optional(),
    sourceRepository: RepositorySchema,
    sourceCommitSha: FullShaSchema,
    stateHash: HashSchema,
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    previousHash: HashSchema.nullable().optional(),
    eventHash: HashSchema,
    occurredAt: zod_1.z.string(),
});
const VerificationSchema = zod_1.z.object({
    valid: zod_1.z.boolean(),
    verifiedEvents: zod_1.z.number().int().nonnegative(),
    lastEventHash: HashSchema.nullable().optional(),
    failedSequence: zod_1.z.number().int().positive().optional(),
    reason: zod_1.z.string().optional(),
});
const CheckpointResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    checkpoint: CheckpointSchema.nullable(),
});
const EventsResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    events: zod_1.z.array(EventSchema),
});
const VerificationResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    verification: VerificationSchema,
});
class ProjectOSMemoryError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ProjectOSMemoryError';
        this.status = status;
    }
}
exports.ProjectOSMemoryError = ProjectOSMemoryError;
function parsedValue(schema, value, message) {
    try {
        return schema.parse(value);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            throw new ProjectOSMemoryError(message);
        throw error;
    }
}
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-supabase-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new ProjectOSMemoryError('ProjectOS memory endpoint is not trusted');
    }
    return endpoint.toString();
}
function validOptionalKey(value, label) {
    if (value == null || value.trim() === '')
        return null;
    const normalized = value.trim();
    if (normalized.length > 160)
        throw new ProjectOSMemoryError(`${label} is too long`);
    return normalized;
}
class ProjectOSMemoryClient {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async saveCheckpoint(vercelOidcToken, input) {
        const parsedInput = parsedValue(zod_1.z.object({
            projectKey: ProjectKeySchema,
            expectedVersion: zod_1.z.number().int().nonnegative(),
            status: StatusSchema,
            sourceRepository: RepositorySchema,
            sourceCommitSha: FullShaSchema,
            planVersion: zod_1.z.string().min(1).max(64),
            state: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
            observedAt: zod_1.z.string().datetime({ offset: true }),
            eventType: zod_1.z.string().regex(/^projectos\.[a-z0-9_.-]{1,127}$/).optional(),
            runId: zod_1.z.string().uuid().nullable().optional(),
            stepId: zod_1.z.string().uuid().nullable().optional(),
        }), input, 'ProjectOS checkpoint input is invalid');
        const response = await this.request(vercelOidcToken, {
            action: 'projectos_checkpoint_save',
            ...parsedInput,
            phaseKey: validOptionalKey(input.phaseKey, 'ProjectOS phase key'),
            primaryTaskKey: validOptionalKey(input.primaryTaskKey, 'ProjectOS task key'),
        });
        const checkpoint = parsedValue(CheckpointResponseSchema, response, 'ProjectOS memory returned an invalid checkpoint response').checkpoint;
        if (!checkpoint)
            throw new ProjectOSMemoryError('ProjectOS memory returned no checkpoint');
        return checkpoint;
    }
    async getCheckpoint(vercelOidcToken, projectKey) {
        const response = await this.request(vercelOidcToken, {
            action: 'projectos_checkpoint_get',
            projectKey: parsedValue(ProjectKeySchema, projectKey, 'ProjectOS project key is invalid'),
        });
        return parsedValue(CheckpointResponseSchema, response, 'ProjectOS memory returned an invalid checkpoint response').checkpoint;
    }
    async listEvents(vercelOidcToken, projectKey, limit) {
        const response = await this.request(vercelOidcToken, {
            action: 'projectos_event_list',
            projectKey: parsedValue(ProjectKeySchema, projectKey, 'ProjectOS project key is invalid'),
            limit: Math.min(Math.max(Math.trunc(limit), 1), 500),
        });
        return parsedValue(EventsResponseSchema, response, 'ProjectOS memory returned an invalid event response').events;
    }
    async verifyEvents(vercelOidcToken, projectKey) {
        const response = await this.request(vercelOidcToken, {
            action: 'projectos_event_verify',
            projectKey: parsedValue(ProjectKeySchema, projectKey, 'ProjectOS project key is invalid'),
        });
        return parsedValue(VerificationResponseSchema, response, 'ProjectOS memory returned an invalid verification response').verification;
    }
    async request(vercelOidcToken, payload) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new ProjectOSMemoryError('Vercel OIDC runtime token is required');
        }
        const encoded = JSON.stringify(payload);
        if (Buffer.byteLength(encoded, 'utf8') > 256000) {
            throw new ProjectOSMemoryError('ProjectOS memory request is too large', 413);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchFn(this.endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: encoded,
                signal: controller.signal,
                redirect: 'error',
            });
            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new ProjectOSMemoryError('ProjectOS memory response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new ProjectOSMemoryError('ProjectOS memory response is too large');
            }
            if (!response.ok) {
                let code = 'request_failed';
                try {
                    const parsed = JSON.parse(body);
                    if (typeof parsed.error === 'string')
                        code = parsed.error;
                }
                catch {
                    // Preserve a normalized error without exposing provider response content.
                }
                throw new ProjectOSMemoryError(`ProjectOS memory request failed with status ${response.status}: ${code}`, response.status);
            }
            try {
                return JSON.parse(body);
            }
            catch {
                throw new ProjectOSMemoryError('ProjectOS memory returned invalid JSON');
            }
        }
        catch (error) {
            if (error instanceof ProjectOSMemoryError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ProjectOSMemoryError('ProjectOS memory request timed out');
            }
            throw new ProjectOSMemoryError('ProjectOS memory request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.ProjectOSMemoryClient = ProjectOSMemoryClient;
//# sourceMappingURL=durable-memory-client.js.map