"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const { executeSupabaseProviderApiTool } = require("../src/tools/provider-api.js");
const { executeSupabaseTool } = require("../src/tools/supabase.js");
const { executeSupabaseAuthSecurityTool } = require("../src/tools/supabase-auth-security.js");
const { executeTool, getRuntimeToolDefinition } = require("../src/runtime/tool-catalog.js");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261018121000_pandora_supabase_connector_policy_widen_v1.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const testSource = fs.readFileSync(__filename, "utf8");

const EXPECTED_IDS = [
  "d3ea6e4a-a631-4599-86b0-cdf2e396eea1",
  "51489801-4e6e-49d8-aeac-abc1d749a1ab",
];
const EXPECTED_SCOPES = [
  "projects:read",
  "projects:write",
  "organizations:read",
  "auth:read",
];
const EXPECTED_REFS = [
  "jcyqixttuebxqqfkjonq",
  "ivmvufhcsezyhczzondn",
  "xyefkykwuppbweabvvmk",
];
const EXPECTED_SLUGS = [
  "hcnwqoagmembvbkywwxb",
  "ebfctewrnfobwgypfyer",
];

function stripSqlComments(source) {
  return source
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

test("Supabase connector policy widen migration targets exact installation IDs, scopes, refs, and slugs via JSONB merge", () => {
  const executableSql = stripSqlComments(sql);

  const uuidMatches = [
    ...executableSql.matchAll(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ),
  ].map((match) => match[0].toLowerCase());
  assert.deepEqual([...new Set(uuidMatches)].sort(), [...EXPECTED_IDS].sort());

  const scopesMatch = executableSql.match(
    /scopes\s*=\s*array\s*\[\s*([^\]]+)\s*\]\s*::\s*text\[\]/i,
  );
  assert.ok(scopesMatch, "Expected explicit scopes = array[...]::text[] assignment");
  const parsedScopes = [...scopesMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(parsedScopes, EXPECTED_SCOPES);

  assert.match(
    executableSql,
    /configuration\s*=\s*configuration\s*\|\|\s*jsonb_build_object\s*\(/i,
    "Migration must merge configuration with `configuration || jsonb_build_object(...)`",
  );

  const refsMatch = executableSql.match(
    /'allowed_project_refs'\s*,\s*jsonb_build_array\s*\(\s*([^)]+)\s*\)/i,
  );
  assert.ok(refsMatch, "Expected allowed_project_refs jsonb_build_array");
  const parsedRefs = [...refsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(parsedRefs, EXPECTED_REFS);

  const slugsMatch = executableSql.match(
    /'organization_slugs'\s*,\s*jsonb_build_array\s*\(\s*([^)]+)\s*\)/i,
  );
  assert.ok(slugsMatch, "Expected organization_slugs jsonb_build_array");
  const parsedSlugs = [...slugsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(parsedSlugs, EXPECTED_SLUGS);

  assert.match(executableSql, /updated_at\s*=\s*timezone\s*\(\s*'utc'\s*,\s*now\(\)\s*\)/i);
  assert.match(executableSql, /if\s+v_rows\s*<>\s*2\s+then\s+raise\s+exception/i);
});

test("Supabase connector policy widen migration touches only connector_installations and contains no forbidden statements or token literals", () => {
  const executableSql = stripSqlComments(sql);

  assert.doesNotMatch(executableSql, /\bgrant\b/i);
  assert.doesNotMatch(executableSql, /\brevoke\b/i);
  assert.doesNotMatch(executableSql, /\balter\b/i);
  assert.doesNotMatch(executableSql, /\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(executableSql, /\bsecurity\s+definer\b/i);
  assert.doesNotMatch(executableSql, /\bvault\b/i);
  assert.doesNotMatch(executableSql, /\bcredential_refs\b/i);
  assert.doesNotMatch(executableSql, /\bauth\./i);

  const tokenLiteralPattern = /sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}/;
  assert.doesNotMatch(sql, tokenLiteralPattern, "Migration must not contain token-like literals");
  assert.doesNotMatch(testSource, tokenLiteralPattern, "Test must not contain token-like literals");
});

test("Supabase connector policy widen migration is replay-safe, idempotent, and preserves existing configuration keys in PGlite", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.connector_installations (
        id uuid primary key,
        provider text not null,
        scopes text[] not null default '{}'::text[],
        configuration jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default timezone('utc', now())
      );
    `);

    // Replay-safe when rows are absent: notices and returns without throwing.
    await db.exec(sql);

    await db.exec(`
      insert into public.connector_installations (id, provider, scopes, configuration, updated_at)
      values
        (
          'd3ea6e4a-a631-4599-86b0-cdf2e396eea1',
          'supabase',
          array['projects:read','projects:write']::text[],
          jsonb_build_object(
            'account_id','pandoras-box',
            'auth_mode','pat',
            'secret_name','Supabase_access',
            'credential_state','vault_configured',
            'management_api_origin','https://api.supabase.com/v1',
            'allow_mutations',true,
            'project_ref','jcyqixttuebxqqfkjonq',
            'project_name','pandoras-box',
            'allowed_project_refs',jsonb_build_array('jcyqixttuebxqqfkjonq')
          ),
          '2026-09-06T14:24:36Z'::timestamptz
        ),
        (
          '51489801-4e6e-49d8-aeac-abc1d749a1ab',
          'supabase',
          array['projects:read','projects:write']::text[],
          jsonb_build_object(
            'account_id','pandoras-box-memory',
            'auth_mode','pat',
            'secret_name','Supabase_access',
            'credential_state','vault_configured',
            'management_api_origin','https://api.supabase.com/v1',
            'allow_mutations',true,
            'project_ref','ivmvufhcsezyhczzondn',
            'project_name','pandoras-box-memory',
            'allowed_project_refs',jsonb_build_array('ivmvufhcsezyhczzondn')
          ),
          '2026-09-06T14:24:36Z'::timestamptz
        );
    `);

    await db.exec(sql);
    // Run a second time to verify idempotency.
    await db.exec(sql);

    const { rows } = await db.query(`
      select id, scopes, configuration, updated_at > '2026-09-06T14:24:36Z'::timestamptz as timestamp_advanced
      from public.connector_installations
      order by configuration ->> 'account_id'
    `);
    assert.equal(rows.length, 2);

    const [first, second] = rows;
    assert.deepEqual(first.scopes, EXPECTED_SCOPES);
    assert.deepEqual(second.scopes, EXPECTED_SCOPES);
    assert.equal(first.timestamp_advanced, true);
    assert.equal(second.timestamp_advanced, true);

    assert.equal(first.configuration.account_id, "pandoras-box");
    assert.equal(first.configuration.auth_mode, "pat");
    assert.equal(first.configuration.secret_name, "Supabase_access");
    assert.equal(first.configuration.allow_mutations, true);
    assert.equal(first.configuration.project_ref, "jcyqixttuebxqqfkjonq");
    assert.deepEqual(first.configuration.allowed_project_refs, EXPECTED_REFS);
    assert.deepEqual(first.configuration.organization_slugs, EXPECTED_SLUGS);

    assert.equal(second.configuration.account_id, "pandoras-box-memory");
    assert.equal(second.configuration.auth_mode, "pat");
    assert.equal(second.configuration.secret_name, "Supabase_access");
    assert.equal(second.configuration.allow_mutations, true);
    assert.equal(second.configuration.project_ref, "ivmvufhcsezyhczzondn");
    assert.deepEqual(second.configuration.allowed_project_refs, EXPECTED_REFS);
    assert.deepEqual(second.configuration.organization_slugs, EXPECTED_SLUGS);
  } finally {
    await db.close();
  }
});

test("Real Supabase adapters with widened policy allow org read, Plp project read, auth-security config read, and deny non-allowlisted project ref", async () => {
  const widenedConfiguration = {
    accounts: [
      {
        id: "pandoras-box",
        label: "Supabase Account — Pandoras-box",
        authMode: "pat",
        token: "test-placeholder-credential",
        allowMutations: true,
        grantedScopes: EXPECTED_SCOPES,
        allowedProjectRefs: EXPECTED_REFS,
        allowedOrganizationSlugs: EXPECTED_SLUGS,
      },
    ],
  };

  const calls = [];
  const stubFetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url));
    calls.push({ method: init.method || "GET", pathname: parsedUrl.pathname });

    const jsonResponse = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-type" ? "application/json" : null;
        },
      },
      async text() {
        return JSON.stringify(body);
      },
      async json() {
        return body;
      },
    });

    if (parsedUrl.pathname === "/v1/organizations/hcnwqoagmembvbkywwxb") {
      return jsonResponse({
        id: "hcnwqoagmembvbkywwxb",
        slug: "hcnwqoagmembvbkywwxb",
        name: "Primary Org",
      });
    }
    if (parsedUrl.pathname === "/v1/projects/xyefkykwuppbweabvvmk") {
      return jsonResponse({
        id: "proj_plp",
        ref: "xyefkykwuppbweabvvmk",
        organization_id: "ebfctewrnfobwgypfyer",
        organization_slug: "ebfctewrnfobwgypfyer",
        name: "Plp",
        region: "us-east-1",
        status: "ACTIVE_HEALTHY",
      });
    }
    if (parsedUrl.pathname === "/v1/projects/xyefkykwuppbweabvvmk/config/auth") {
      return jsonResponse({
        password_hibp_enabled: true,
      });
    }
    return jsonResponse({ error: "unexpected_path", pathname: parsedUrl.pathname }, 404);
  };

  // 1. read-organization-api on hcnwqoagmembvbkywwxb is allowed.
  const orgResult = await executeSupabaseProviderApiTool(
    "supabase.read-organization-api",
    {
      accountId: "pandoras-box",
      organizationSlug: "hcnwqoagmembvbkywwxb",
    },
    widenedConfiguration,
    stubFetch,
  );
  assert.equal(orgResult.slug, "hcnwqoagmembvbkywwxb");

  // 2. get-project and read-project-api on xyefkykwuppbweabvvmk (Plp in org ebfctewrnfobwgypfyer) are allowed.
  const projectResult = await executeSupabaseTool(
    "supabase.get-project",
    {
      accountId: "pandoras-box",
      projectRef: "xyefkykwuppbweabvvmk",
    },
    widenedConfiguration,
    stubFetch,
  );
  assert.equal(projectResult.ref, "xyefkykwuppbweabvvmk");
  assert.equal(projectResult.organizationSlug, "ebfctewrnfobwgypfyer");

  const readProjectApiResult = await executeSupabaseProviderApiTool(
    "supabase.read-project-api",
    {
      accountId: "pandoras-box",
      projectRef: "xyefkykwuppbweabvvmk",
    },
    widenedConfiguration,
    stubFetch,
  );
  assert.equal(readProjectApiResult.ref, "xyefkykwuppbweabvvmk");
  assert.equal(readProjectApiResult.organization_slug, "ebfctewrnfobwgypfyer");

  // 3. get-auth-security-config scope check passes with auth:read in tool-catalog + adapter succeeds.
  const authToolDef = getRuntimeToolDefinition("supabase.get-auth-security-config");
  assert.ok(authToolDef);
  assert.deepEqual(authToolDef.manifest.requiredProviderScopes, ["auth:read"]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;
  try {
    const catalogAuthResult = await executeTool(
      "supabase.get-auth-security-config",
      {
        accountId: "pandoras-box",
        projectRef: "xyefkykwuppbweabvvmk",
      },
      { supabase: widenedConfiguration },
    );
    assert.equal(catalogAuthResult.accountId, "pandoras-box");
    assert.equal(catalogAuthResult.projectRef, "xyefkykwuppbweabvvmk");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const directAuthResult = await executeSupabaseAuthSecurityTool(
    "supabase.get-auth-security-config",
    {
      accountId: "pandoras-box",
      projectRef: "xyefkykwuppbweabvvmk",
    },
    widenedConfiguration,
    stubFetch,
  );
  assert.equal(directAuthResult.leakedPasswordProtectionEnabled, true);

  // 4. Non-allowlisted ref (qlzcqzqbcjioweatllhi) is still denied before any fetch to it.
  const callCountBeforeDenied = calls.length;
  await assert.rejects(
    executeSupabaseTool(
      "supabase.get-project",
      {
        accountId: "pandoras-box",
        projectRef: "qlzcqzqbcjioweatllhi",
      },
      widenedConfiguration,
      stubFetch,
    ),
    /Supabase account pandoras-box is not allowed to access project qlzcqzqbcjioweatllhi/,
  );
  await assert.rejects(
    executeSupabaseProviderApiTool(
      "supabase.read-project-api",
      {
        accountId: "pandoras-box",
        projectRef: "qlzcqzqbcjioweatllhi",
      },
      widenedConfiguration,
      stubFetch,
    ),
    /Supabase account pandoras-box is not allowed to access project qlzcqzqbcjioweatllhi/,
  );
  assert.equal(calls.length, callCountBeforeDenied, "Denied project ref must not trigger any provider fetch");
});
