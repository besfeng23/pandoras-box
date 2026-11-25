"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setProjectOSIntegrationHealth = setProjectOSIntegrationHealth;
const zod_1 = require("zod");
const control_client_js_1 = require("./control-client.js");
const ENDPOINT = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/projectos-control';
const StatusSchema = zod_1.z.enum(['healthy', 'degraded', 'down', 'unknown', 'not_configured']);
async function setProjectOSIntegrationHealth(vercelOidcToken, input, fetchFn = fetch) {
    const token = vercelOidcToken?.trim();
    if (!token || token.length < 20)
        throw new control_client_js_1.ProjectOSControlError('Vercel OIDC runtime token is required');
    const parsed = zod_1.z.object({
        projectKey: zod_1.z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
        provider: zod_1.z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
        status: StatusSchema,
        details: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        lastEventAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
        lastSuccessAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
        staleAfter: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    }).parse(input);
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
            body: JSON.stringify({ action: 'health_set', ...parsed }),
        });
        const body = await response.text();
        if (Buffer.byteLength(body, 'utf8') > 128000)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS health response is too large', 502);
        const decoded = JSON.parse(body);
        if (!response.ok || decoded.ok !== true)
            throw new control_client_js_1.ProjectOSControlError('ProjectOS health update failed', response.status);
        return decoded.health;
    }
    catch (error) {
        if (error instanceof control_client_js_1.ProjectOSControlError)
            throw error;
        if (error instanceof Error && error.name === 'AbortError')
            throw new control_client_js_1.ProjectOSControlError('ProjectOS health update timed out', 504);
        throw new control_client_js_1.ProjectOSControlError('ProjectOS health update failed', 502);
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=health-client.js.map