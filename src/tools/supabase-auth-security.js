"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAuthSecurityTools = exports.SupabaseAuthSecurityServer = exports.SupabaseAuthSecurityError = void 0;
exports.executeSupabaseAuthSecurityTool = executeSupabaseAuthSecurityTool;
const zod_1 = require("zod");
const provider_execution_state_machine_js_1 = require("../runtime/provider-execution-state-machine.js");
const MANAGEMENT_API_ORIGIN = 'https://api.supabase.com/v1';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 1000000;
const AUTH_CONFIG_PATH = 'config/auth';
const HIBP_FIELD = 'password_hibp_enabled';
const ProjectRefSchema = zod_1.z.string().regex(/^[a-z0-9]{20}$/);
const ReadArgsSchema = zod_1.z.object({
    accountId: zod_1.z.string().min(1),
    projectRef: ProjectRefSchema,
}).strict();
const EnableArgsSchema = ReadArgsSchema.extend({
    enabled: zod_1.z.literal(true),
    confirmation: zod_1.z.string().min(1),
}).strict();
const ProjectSchema = zod_1.z.object({
    ref: ProjectRefSchema,
    organization_slug: zod_1.z.string().optional(),
}).passthrough();
const AuthConfigSchema = zod_1.z.object({
    password_hibp_enabled: zod_1.z.boolean(),
}).passthrough();
class SupabaseAuthSecurityError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'SupabaseAuthSecurityError';
        this.status = status;
    }
}
exports.SupabaseAuthSecurityError = SupabaseAuthSecurityError;
function localPolicyDenial(message, status = 403) {
    return (0, provider_execution_state_machine_js_1.markProviderOutcome)(new SupabaseAuthSecurityError(message, status), 'failed_before_side_effects', 'local_policy_denial');
}
function expectedConfirmation(projectRef) {
    return `ENABLE LEAKED PASSWORD PROTECTION ${projectRef}`;
}
function normalizeAuthConfig(accountId, projectRef, value) {
    return {
        accountId,
        projectRef,
        leakedPasswordProtectionEnabled: value.password_hibp_enabled,
    };
}
class SupabaseAuthSecurityServer {
    constructor(configuration, fetchFn = globalThis.fetch) {
        this.configuration = configuration;
        this.fetchFn = fetchFn;
        this.timeoutMs = configuration.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = configuration.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
    }
    async getAuthSecurityConfig(accountId, projectRef) {
        const account = this.account(accountId);
        await this.ensureProjectAllowed(account, projectRef);
        return normalizeAuthConfig(accountId, projectRef, await this.readAuthConfig(account, projectRef));
    }
    async enableLeakedPasswordProtection(accountId, projectRef, enabled, confirmation) {
        const account = this.account(accountId);
        this.assertMutationAllowed(account);
        if (enabled !== true) {
            throw new SupabaseAuthSecurityError('Leaked password protection can only be enabled', 400);
        }
        this.assertConfirmation(confirmation, expectedConfirmation(projectRef));
        await this.ensureProjectAllowed(account, projectRef);
        const previous = await this.readAuthConfig(account, projectRef);
        if (previous.password_hibp_enabled) {
            return {
                ...normalizeAuthConfig(accountId, projectRef, previous),
                previousEnabled: true,
                changed: false,
                status: 'already-enabled',
            };
        }
        try {
            await this.request(account, `/projects/${encodeURIComponent(projectRef)}/${AUTH_CONFIG_PATH}`, 'PATCH', { [HIBP_FIELD]: true });
            const verified = await this.readAuthConfig(account, projectRef);
            if (!verified.password_hibp_enabled) {
                throw new SupabaseAuthSecurityError('Supabase did not confirm leaked password protection was enabled');
            }
            return {
                ...normalizeAuthConfig(accountId, projectRef, verified),
                previousEnabled: false,
                changed: true,
                status: 'enabled',
            };
        }
        catch (error) {
            const rolledBack = await this.rollbackFailedEnable(account, projectRef);
            if (!rolledBack) {
                throw new SupabaseAuthSecurityError(`${error instanceof Error ? error.message : 'Supabase Auth security update failed'}; automatic rollback failed`);
            }
            throw error;
        }
    }
    account(accountId) {
        const account = this.configuration.accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
            throw localPolicyDenial(`Unknown Supabase account: ${accountId}`, 404);
        }
        return account;
    }
    assertMutationAllowed(account) {
        if (!account.allowMutations) {
            throw localPolicyDenial(`Mutations are disabled for Supabase account ${account.id}`, 403);
        }
    }
    assertConfirmation(actual, expected) {
        if (actual !== expected) {
            throw new SupabaseAuthSecurityError(`Confirmation must exactly equal "${expected}"`, 400);
        }
    }
    assertProjectRefAllowed(account, projectRef) {
        if (account.allowedProjectRefs.length === 0
            || !account.allowedProjectRefs.includes(projectRef)) {
            throw localPolicyDenial(`Supabase account ${account.id} is not explicitly allowed to access project ${projectRef}`, 403);
        }
    }
    async ensureProjectAllowed(account, projectRef) {
        this.assertProjectRefAllowed(account, projectRef);
        if (account.allowedOrganizationSlugs.length === 0)
            return;
        const project = ProjectSchema.parse(await this.request(account, `/projects/${encodeURIComponent(projectRef)}`, 'GET'));
        if (!project.organization_slug
            || !account.allowedOrganizationSlugs.includes(project.organization_slug)) {
            throw new SupabaseAuthSecurityError(`Supabase account ${account.id} is not allowed to access project ${projectRef}`, 403);
        }
    }
    async readAuthConfig(account, projectRef) {
        return AuthConfigSchema.parse(await this.request(account, `/projects/${encodeURIComponent(projectRef)}/${AUTH_CONFIG_PATH}`, 'GET'));
    }
    async rollbackFailedEnable(account, projectRef) {
        try {
            await this.request(account, `/projects/${encodeURIComponent(projectRef)}/${AUTH_CONFIG_PATH}`, 'PATCH', { [HIBP_FIELD]: false });
            const verified = await this.readAuthConfig(account, projectRef);
            return verified.password_hibp_enabled === false;
        }
        catch {
            return false;
        }
    }
    async request(account, path, method, body) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchFn(`${MANAGEMENT_API_ORIGIN}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${account.token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'MCPMaster-Supabase-Auth-Security/1.0',
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: controller.signal,
                redirect: 'error',
            });
            return await this.parseResponse(response);
        }
        catch (error) {
            if (error instanceof SupabaseAuthSecurityError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SupabaseAuthSecurityError('Supabase Management API request timed out');
            }
            throw new SupabaseAuthSecurityError('Supabase Management API request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async parseResponse(response) {
        const declaredLength = Number(response.headers?.get('content-length') || '0');
        if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
            throw new SupabaseAuthSecurityError('Supabase Management API response exceeded size limit');
        }
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > this.maxResponseBytes) {
            throw new SupabaseAuthSecurityError('Supabase Management API response exceeded size limit');
        }
        if (!response.ok) {
            throw new SupabaseAuthSecurityError(`Supabase Management API request failed with ${response.status}`, response.status);
        }
        if (!text.trim())
            return {};
        try {
            return JSON.parse(text);
        }
        catch {
            throw new SupabaseAuthSecurityError('Supabase Management API returned invalid JSON');
        }
    }
}
exports.SupabaseAuthSecurityServer = SupabaseAuthSecurityServer;
exports.supabaseAuthSecurityTools = {
    'supabase.get-auth-security-config': {
        description: 'Read only whether leaked password protection is enabled for one explicitly allowlisted Supabase project',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                accountId: { type: 'string', description: 'Configured MCPMaster Supabase account ID' },
                projectRef: { type: 'string', description: 'Exact 20-character Supabase project ref' },
            },
            required: ['accountId', 'projectRef'],
        },
    },
    'supabase.enable-leaked-password-protection': {
        description: 'Enable leaked password protection for one explicitly allowlisted Supabase project; disabling and unrelated Auth changes are rejected',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                accountId: { type: 'string', description: 'Configured MCPMaster Supabase account ID' },
                projectRef: { type: 'string', description: 'Exact 20-character Supabase project ref' },
                enabled: { type: 'boolean', const: true, description: 'Must be true; disabling is not supported' },
                confirmation: {
                    type: 'string',
                    description: 'Must exactly equal ENABLE LEAKED PASSWORD PROTECTION <projectRef>',
                },
            },
            required: ['accountId', 'projectRef', 'enabled', 'confirmation'],
        },
    },
};
async function executeSupabaseAuthSecurityTool(tool, args, configuration, fetchFn) {
    const server = new SupabaseAuthSecurityServer(configuration, fetchFn);
    switch (tool) {
        case 'supabase.get-auth-security-config': {
            const input = ReadArgsSchema.parse(args);
            return server.getAuthSecurityConfig(input.accountId, input.projectRef);
        }
        case 'supabase.enable-leaked-password-protection': {
            const input = EnableArgsSchema.parse(args);
            return server.enableLeakedPasswordProtection(input.accountId, input.projectRef, input.enabled, input.confirmation);
        }
        default:
            throw new SupabaseAuthSecurityError(`Unknown Supabase Auth security tool: ${tool}`, 404);
    }
}
//# sourceMappingURL=supabase-auth-security.js.map