"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { executeTool } = require("../src/runtime/tool-catalog.js");
const { executeSupabaseProviderApiTool } = require("../src/tools/provider-api.js");
const { executeSupabaseTool } = require("../src/tools/supabase.js");
const {
  createProviderExecutionStateMachine,
  ProviderExecutionOutcomeError,
} = require("../src/runtime/provider-execution-state-machine.js");

function createStubStateMachine(rawExecute = executeTool) {
  const ledger = {
    async finishPlan(_token, input) {
      return { planId: input.planId, status: input.status };
    },
  };
  return createProviderExecutionStateMachine({
    execute: rawExecute,
    ledger,
  });
}

function baseSupabaseConfig(overrides = {}) {
  return {
    supabase: {
      accounts: [
        {
          id: "pandoras-box",
          label: "Supabase Account — Pandoras-box",
          authMode: "pat",
          token: "test-placeholder-credential",
          allowMutations: true,
          grantedScopes: ["projects:read", "projects:write"],
          allowedProjectRefs: ["jcyqixttuebxqqfkjonq"],
          allowedOrganizationSlugs: ["hcnwqoagmembvbkywwxb"],
          ...overrides,
        },
      ],
    },
  };
}

test("missing-scope pre-dispatch denial produces status 403, failed_before_side_effects, and reconciliationRequired false", async () => {
  const stateMachine = createStubStateMachine(executeTool);

  await assert.rejects(
    stateMachine.run(() =>
      stateMachine.execute(
        "supabase.get-auth-security-config",
        {
          accountId: "pandoras-box",
          projectRef: "jcyqixttuebxqqfkjonq",
        },
        baseSupabaseConfig({ grantedScopes: ["projects:read"] }),
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 403);
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.reconciliationRequired, false);
      assert.equal(error.retryable, false);
      assert.equal(error.failure.providerOutcome, "failed_before_side_effects");
      assert.equal(error.failure.reconciliationRequired, false);
      assert.equal(error.failure.terminalClassification, "failed_without_side_effect");
      return true;
    },
  );
});

test("non-allowlisted project and organization reads fail fast with status 403, failed_before_side_effects, and reconciliationRequired false across catalog and adapters", async () => {
  const stateMachine = createStubStateMachine(executeTool);

  // 1. Non-allowlisted project via supabase.read-project-api (provider-api.js)
  await assert.rejects(
    stateMachine.run(() =>
      stateMachine.execute(
        "supabase.read-project-api",
        {
          accountId: "pandoras-box",
          projectRef: "qlzcqzqbcjioweatllhi",
        },
        baseSupabaseConfig(),
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 403);
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.reconciliationRequired, false);
      return true;
    },
  );

  // 2. Non-allowlisted project via supabase.get-project (supabase.js)
  await assert.rejects(
    stateMachine.run(() =>
      stateMachine.execute(
        "supabase.get-project",
        {
          accountId: "pandoras-box",
          projectRef: "qlzcqzqbcjioweatllhi",
        },
        baseSupabaseConfig(),
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 403);
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.reconciliationRequired, false);
      return true;
    },
  );

  // 3. Non-allowlisted organization via supabase.read-organization-api (provider-api.js)
  await assert.rejects(
    stateMachine.run(() =>
      stateMachine.execute(
        "supabase.read-organization-api",
        {
          accountId: "pandoras-box",
          organizationSlug: "ebfctewrnfobwgypfyer",
        },
        baseSupabaseConfig({
          grantedScopes: ["projects:read", "organizations:read"],
          allowedOrganizationSlugs: ["hcnwqoagmembvbkywwxb"],
        }),
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 403);
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.reconciliationRequired, false);
      return true;
    },
  );

  // 4. Unknown account and mutations disabled in tool-catalog
  await assert.rejects(
    stateMachine.run(() =>
      stateMachine.execute(
        "supabase.get-project",
        {
          accountId: "unknown-account",
          projectRef: "jcyqixttuebxqqfkjonq",
        },
        baseSupabaseConfig(),
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 403);
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.reconciliationRequired, false);
      return true;
    },
  );
});

test("genuine provider 5xx and transport timeout after dispatch remain ambiguous with reconciliationRequired true", async () => {
  const config = baseSupabaseConfig().supabase;

  // 1. Provider 502 error from SupabaseMCPServer (supabase.js)
  const stateMachineSupabase502 = createStubStateMachine((tool, args, configuration) =>
    executeSupabaseTool(
      tool,
      args,
      configuration,
      async () => ({
        ok: false,
        status: 502,
        headers: { get: () => "application/json" },
        async text() {
          return JSON.stringify({ message: "bad gateway" });
        },
      }),
    ),
  );

  await assert.rejects(
    stateMachineSupabase502.run(() =>
      stateMachineSupabase502.execute(
        "supabase.get-project",
        {
          accountId: "pandoras-box",
          projectRef: "jcyqixttuebxqqfkjonq",
        },
        config,
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 502);
      assert.equal(error.providerOutcome, "ambiguous");
      assert.equal(error.reconciliationRequired, true);
      assert.equal(error.failure.terminalClassification, "reconciliation_required");
      return true;
    },
  );

  // 2. Provider timeout / transport failure from executeSupabaseProviderApiTool (provider-api.js)
  const stateMachineTimeout = createStubStateMachine((tool, args, configuration) =>
    executeSupabaseProviderApiTool(
      tool,
      args,
      configuration,
      async () => {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      },
    ),
  );

  await assert.rejects(
    stateMachineTimeout.run(() =>
      stateMachineTimeout.execute(
        "supabase.read-project-api",
        {
          accountId: "pandoras-box",
          projectRef: "jcyqixttuebxqqfkjonq",
        },
        config,
      ),
    ),
    (error) => {
      assert.ok(error instanceof ProviderExecutionOutcomeError);
      assert.equal(error.status, 503);
      assert.equal(error.providerOutcome, "ambiguous");
      assert.equal(error.reconciliationRequired, true);
      assert.equal(error.failure.terminalClassification, "reconciliation_required");
      return true;
    },
  );
});
