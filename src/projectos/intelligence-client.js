"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectOSContext = getProjectOSContext;
exports.recommendProjectOSAgents = recommendProjectOSAgents;
exports.planProjectOSIntake = planProjectOSIntake;
exports.applyProjectOSManifest = applyProjectOSManifest;
const zod_1 = require("zod");
const control_client_js_1 = require("./control-client.js");
const ENDPOINT = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/projectos-control';
const ProjectKeySchema = zod_1.z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const TaskKeySchema = zod_1.z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
async function request(vercelOidcToken, input, responseKey, fetchFn = fetch) {
    const token = vercelOidcToken?.trim();
    if (!token || token.length < 20)
        throw new control_client_js_1.ProjectOSControlError('Vercel OIDC runtime token is required');
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body, 'utf8') > 512000)
        throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence request is too large', 413);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
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
            body,
        });
        const raw = await response.text();
        if (Buffer.byteLength(raw, 'utf8') > 2000000)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence response is too large', 502);
        const decoded = zod_1.z.object({ ok: zod_1.z.literal(true) }).passthrough().parse(JSON.parse(raw));
        if (!response.ok)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence request failed', response.status);
        return decoded[responseKey];
    }
    catch (error) {
        if (error instanceof control_client_js_1.ProjectOSControlError)
            throw error;
        if (error instanceof Error && error.name === 'AbortError')
            throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence request timed out', 504);
        if (error instanceof zod_1.z.ZodError || error instanceof SyntaxError)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence response is invalid', 502);
        throw new control_client_js_1.ProjectOSControlError('ProjectOS intelligence request failed', 502);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function getProjectOSContext(vercelOidcToken, projectKey, taskKey) {
    return request(vercelOidcToken, {
        action: 'context_get',
        projectKey: ProjectKeySchema.parse(projectKey),
        taskKey: taskKey ? TaskKeySchema.parse(taskKey) : null,
    }, 'context');
}
async function recommendProjectOSAgents(vercelOidcToken, projectKey, role = 'builder', limit = 5) {
    return request(vercelOidcToken, {
        action: 'agents_recommend',
        projectKey: ProjectKeySchema.parse(projectKey),
        role,
        limit: zod_1.z.number().int().min(1).max(20).parse(limit),
    }, 'agents');
}
async function planProjectOSIntake(vercelOidcToken, intakeId, plan) {
    const parsed = zod_1.z.object({
        phases: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).max(100).optional(),
        tasks: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).min(1).max(500),
        dependencies: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).max(1000).optional(),
        analysis: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        source: zod_1.z.string().max(160).optional(),
    }).passthrough().parse(plan);
    return request(vercelOidcToken, {
        action: 'intake_plan',
        intakeId: zod_1.z.string().uuid().parse(intakeId),
        plan: parsed,
    }, 'result');
}
async function applyProjectOSManifest(vercelOidcToken, manifest, createdBy) {
    const parsed = zod_1.z.object({
        policy: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        projects: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).min(1).max(250),
    }).passthrough().parse(manifest);
    return request(vercelOidcToken, {
        action: 'bootstrap_apply',
        manifest: parsed,
        createdBy: createdBy ? zod_1.z.string().uuid().parse(createdBy) : null,
    }, 'result');
}
//# sourceMappingURL=intelligence-client.js.map