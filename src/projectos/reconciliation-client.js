"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectOSRegistry = getProjectOSRegistry;
exports.projectForRepository = projectForRepository;
exports.projectForVercelProject = projectForVercelProject;
const zod_1 = require("zod");
const control_client_js_1 = require("./control-client.js");
const ENDPOINT = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/projectos-control';
const ResourceSchema = zod_1.z.object({
    provider: zod_1.z.string(),
    resourceType: zod_1.z.string(),
    externalId: zod_1.z.string(),
    externalName: zod_1.z.string().nullable().optional(),
    environment: zod_1.z.string().nullable().optional(),
    canonicalUrl: zod_1.z.string().nullable().optional(),
    bindingState: zod_1.z.enum(['verified', 'degraded', 'missing', 'not_required', 'quarantined']),
    configuration: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
const TaskSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    key: zod_1.z.string(),
    title: zod_1.z.string(),
    status: zod_1.z.string(),
    riskClass: zod_1.z.string(),
    completionCriteria: zod_1.z.array(zod_1.z.unknown()),
    currentBranch: zod_1.z.string().nullable().optional(),
    currentPullRequestNumber: zod_1.z.number().int().positive().nullable().optional(),
    currentHeadSha: zod_1.z.string().regex(/^[0-9a-f]{40}$/).nullable().optional(),
    builderAgent: zod_1.z.string().nullable().optional(),
    builderVendor: zod_1.z.string().nullable().optional(),
    reviewerAgent: zod_1.z.string().nullable().optional(),
    reviewerVendor: zod_1.z.string().nullable().optional(),
});
const ProjectSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    key: zod_1.z.string(),
    name: zod_1.z.string(),
    repository: zod_1.z.string().nullable().optional(),
    status: zod_1.z.string(),
    workspacePath: zod_1.z.string(),
    resources: zod_1.z.array(ResourceSchema),
    tasks: zod_1.z.array(TaskSchema),
});
const RegistryResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    registry: zod_1.z.object({
        organizationId: zod_1.z.string().uuid(),
        policy: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable(),
        projects: zod_1.z.array(ProjectSchema),
    }),
});
async function getProjectOSRegistry(vercelOidcToken, fetchFn = fetch) {
    const token = vercelOidcToken?.trim();
    if (!token || token.length < 20)
        throw new control_client_js_1.ProjectOSControlError('Vercel OIDC runtime token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetchFn(ENDPOINT, {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify({ action: 'registry_get' }),
        });
        const body = await response.text();
        if (Buffer.byteLength(body, 'utf8') > 2000000)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS registry response is too large', 502);
        if (!response.ok)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS registry request failed', response.status);
        return RegistryResponseSchema.parse(JSON.parse(body)).registry;
    }
    catch (error) {
        if (error instanceof control_client_js_1.ProjectOSControlError)
            throw error;
        if (error instanceof Error && error.name === 'AbortError')
            throw new control_client_js_1.ProjectOSControlError('ProjectOS registry timed out', 504);
        if (error instanceof zod_1.z.ZodError || error instanceof SyntaxError)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS registry response is invalid', 502);
        throw new control_client_js_1.ProjectOSControlError('ProjectOS registry request failed', 502);
    }
    finally {
        clearTimeout(timeout);
    }
}
function projectForRepository(registry, repository) {
    return registry.projects.find((project) => project.repository?.toLowerCase() === repository.toLowerCase());
}
function projectForVercelProject(registry, projectId) {
    return registry.projects.find((project) => project.resources.some((resource) => resource.provider === 'vercel'
        && resource.resourceType === 'project'
        && resource.externalId === projectId
        && resource.bindingState === 'verified'));
}
//# sourceMappingURL=reconciliation-client.js.map