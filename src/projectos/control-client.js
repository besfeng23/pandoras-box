"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOSControlClient = exports.ProjectOSControlError = void 0;
const zod_1 = require("zod");
const DEFAULT_ENDPOINT = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/projectos-control';
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESPONSE_BYTES = 2000000;
const ProjectKeySchema = zod_1.z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const RepositorySchema = zod_1.z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const FullShaSchema = zod_1.z.string().regex(/^[0-9a-f]{40}$/);
const HashSchema = zod_1.z.string().regex(/^[0-9a-f]{64}$/);
const UuidSchema = zod_1.z.string().uuid();
const ProjectOSResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
}).passthrough();
class ProjectOSControlError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ProjectOSControlError';
        this.status = status;
    }
}
exports.ProjectOSControlError = ProjectOSControlError;
function trustedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/projectos-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new ProjectOSControlError('ProjectOS control endpoint is not trusted');
    }
    return endpoint.toString();
}
function optionalProjectKey(value) {
    if (value == null || value.trim() === '')
        return null;
    return ProjectKeySchema.parse(value.trim());
}
function optionalRepository(value) {
    if (value == null || value.trim() === '')
        return null;
    return RepositorySchema.parse(value.trim());
}
function boundedText(value, maximum) {
    if (value == null || value.trim() === '')
        return null;
    const normalized = value.trim();
    if (normalized.length > maximum)
        throw new ProjectOSControlError('ProjectOS text input is too long');
    return normalized;
}
class ProjectOSControlClient {
    constructor(options = {}) {
        this.endpoint = trustedEndpoint(options.endpoint || DEFAULT_ENDPOINT);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async dashboard(vercelOidcToken, projectKey) {
        const payload = await this.request(vercelOidcToken, {
            action: 'dashboard_get',
            projectKey: optionalProjectKey(projectKey),
        });
        return payload.dashboard;
    }
    async acceptIntake(vercelOidcToken, input) {
        const parsed = zod_1.z.object({
            requesterId: UuidSchema.nullable().optional(),
            requestText: zod_1.z.string().min(1).max(20000),
            requestType: zod_1.z.enum(['work', 'research', 'incident', 'maintenance', 'release', 'idea', 'decision']).optional(),
            source: zod_1.z.enum(['operator', 'chatgpt', 'github', 'slack', 'email', 'api', 'system']).optional(),
            idempotencyKey: zod_1.z.string().min(1).max(256).nullable().optional(),
        }).parse(input);
        const payload = await this.request(vercelOidcToken, {
            action: 'intake_accept',
            ...parsed,
            projectKey: optionalProjectKey(input.projectKey),
            projectName: boundedText(input.projectName, 160),
            repository: optionalRepository(input.repository),
        });
        return payload.result;
    }
    async recordEvent(vercelOidcToken, input) {
        const parsed = zod_1.z.object({
            provider: zod_1.z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
            deliveryId: zod_1.z.string().min(1).max(256),
            eventType: zod_1.z.string().min(1).max(160),
            payloadHash: HashSchema,
            payloadRedacted: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            externalCreatedAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
        }).parse(input);
        const payload = await this.request(vercelOidcToken, {
            action: 'event_record',
            ...parsed,
            projectKey: optionalProjectKey(input.projectKey),
            repository: optionalRepository(input.repository),
        });
        return payload.event;
    }
    async recordEvidence(vercelOidcToken, input) {
        const parsed = zod_1.z.object({
            projectKey: ProjectKeySchema,
            taskKey: zod_1.z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
            evidenceType: zod_1.z.string().regex(/^[a-z][a-z0-9_.-]{1,127}$/),
            provider: zod_1.z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
            externalId: zod_1.z.string().min(1).max(256),
            status: zod_1.z.string().min(1).max(64),
            sourceUrl: zod_1.z.string().url().nullable().optional(),
            headSha: FullShaSchema.nullable().optional(),
            verdict: zod_1.z.string().max(160).nullable().optional(),
            payloadRedacted: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        }).parse(input);
        const payload = await this.request(vercelOidcToken, {
            action: 'evidence_record',
            ...parsed,
            repository: optionalRepository(input.repository),
        });
        return payload.result;
    }
    async recompute(vercelOidcToken, projectKey) {
        const payload = await this.request(vercelOidcToken, {
            action: 'project_recompute',
            projectKey: ProjectKeySchema.parse(projectKey),
        });
        return payload.projection;
    }
    async recordOutcome(vercelOidcToken, input) {
        const parsed = zod_1.z.object({
            projectKey: ProjectKeySchema,
            taskKey: zod_1.z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
            success: zod_1.z.boolean(),
            planned: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            actual: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            qualityScore: zod_1.z.number().min(0).max(100).nullable().optional(),
            durationSeconds: zod_1.z.number().int().nonnegative().nullable().optional(),
            repairAttempts: zod_1.z.number().int().nonnegative().optional(),
            deploymentResult: zod_1.z.string().max(160).nullable().optional(),
            impactMetrics: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            agentObservations: zod_1.z.array(zod_1.z.unknown()).max(100).optional(),
            lessons: zod_1.z.array(zod_1.z.unknown()).max(100).optional(),
        }).parse(input);
        const payload = await this.request(vercelOidcToken, { action: 'outcome_record', ...parsed });
        return payload.result;
    }
    async request(vercelOidcToken, input) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20)
            throw new ProjectOSControlError('Vercel OIDC runtime token is required');
        const body = JSON.stringify(input);
        if (Buffer.byteLength(body, 'utf8') > 256000)
            throw new ProjectOSControlError('ProjectOS request is too large', 413);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchFn(this.endpoint, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
                body,
                redirect: 'error',
                signal: controller.signal,
            });
            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new ProjectOSControlError('ProjectOS response is too large', 502);
            }
            const responseBody = await response.text();
            if (Buffer.byteLength(responseBody, 'utf8') > this.maxResponseBytes) {
                throw new ProjectOSControlError('ProjectOS response is too large', 502);
            }
            let decoded;
            try {
                decoded = JSON.parse(responseBody);
            }
            catch {
                throw new ProjectOSControlError('ProjectOS returned invalid JSON', 502);
            }
            if (!response.ok) {
                const error = zod_1.z.object({ error: zod_1.z.string().optional() }).passthrough().safeParse(decoded);
                throw new ProjectOSControlError(`ProjectOS control request failed: ${error.success ? error.data.error || 'request_failed' : 'request_failed'}`, response.status);
            }
            return ProjectOSResponseSchema.parse(decoded);
        }
        catch (error) {
            if (error instanceof ProjectOSControlError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError')
                throw new ProjectOSControlError('ProjectOS request timed out', 504);
            if (error instanceof zod_1.z.ZodError)
                throw new ProjectOSControlError('ProjectOS returned an invalid response', 502);
            throw new ProjectOSControlError('ProjectOS control request failed', 502);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.ProjectOSControlClient = ProjectOSControlClient;
//# sourceMappingURL=control-client.js.map