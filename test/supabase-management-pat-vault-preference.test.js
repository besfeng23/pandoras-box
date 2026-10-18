"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261018120000_pandora_supabase_management_pat_vault_preference_v1.sql",
);
const catalogMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260728194505_add_control_catalog_scopes.sql",
);
const testPath = __filename;

const sql = fs.readFileSync(migrationPath, "utf8");
const catalogSql = fs.readFileSync(catalogMigrationPath, "utf8");
const testSource = fs.readFileSync(testPath, "utf8");

test("Supabase Management PAT preference migration targets all five governed adapters", () => {
  const expectedTargets = [
    "private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)",
    "public.pandora_chat_capability_dispatch_core_v1(uuid, text, uuid, uuid)",
    "public.pandora_chat_capability_dispatch_native_v1(uuid, text, uuid, uuid)",
    "private.pandora_release_deploy_edge_from_github_20260829(text, text)",
    "private.pandora_memory_release_deploy_projectos_bridge_20260904(text)",
  ];
  for (const target of expectedTargets) {
    assert.ok(
      sql.includes(`'${target}'`),
      `Expected migration to list target regprocedure ${target}`,
    );
  }
});

test("Supabase Management PAT preference migration maps exact credential selection replacements and prefers Supabase_access", () => {
  const oldOrderA =
    "order by case when name='mcpmaster_supabase_account_1_pat' then 0 else 1 end";
  const newOrderA =
    "order by case when name='Supabase_access' then 0 else 1 end";

  const oldWhereB =
    "where name in ('mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')";
  const newWhereB =
    "where name in ('Supabase_access','mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')";
  const oldOrderB =
    "order by case name when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end";
  const newOrderB =
    "order by case name when 'Supabase_access' then 0 when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end";

  assert.ok(sql.includes(oldOrderA), "Missing old order clause for read/chat adapters");
  assert.ok(sql.includes(newOrderA), "Missing new order clause preferring Supabase_access for read/chat adapters");
  assert.ok(sql.includes(oldWhereB), "Missing old where clause for deploy brokers");
  assert.ok(sql.includes(newWhereB), "Missing new where clause including Supabase_access first for deploy brokers");
  assert.ok(sql.includes(oldOrderB), "Missing old order clause for deploy brokers");
  assert.ok(sql.includes(newOrderB), "Missing new order clause preferring Supabase_access for deploy brokers");

  assert.match(sql, /replace\(\s*v_def,\s*v_old_order_a,\s*v_new_order_a\s*\)/);
  assert.match(
    sql,
    /replace\(\s*replace\(\s*v_def,\s*v_old_where_b,\s*v_new_where_b\s*\),\s*v_old_order_b,\s*v_new_order_b\s*\)/,
  );

  assert.doesNotMatch(
    sql,
    /when\s+(?:name\s*=\s*)?'mcpmaster_supabase_account_2_pat'\s+then\s+[01]\b/i,
    "mcpmaster_supabase_account_2_pat must never be ordered first",
  );
});

test("Supabase Management PAT preference migration fails closed, is idempotent, and preserves security boundaries", () => {
  assert.match(sql, /pg_get_functiondef\(v_proc\)/);
  assert.match(sql, /to_regprocedure\(v_target\)/);
  assert.match(sql, /raise notice 'Skipping missing function %', v_target;/);
  assert.match(sql, /raise notice 'Function % already prefers Supabase_access; skipping', v_target;/);
  assert.match(sql, /raise exception 'Expected credential preference snippet missing in %', v_target/);
  assert.match(sql, /raise exception 'Expected deploy broker credential snippet missing in %', v_target/);
  assert.match(sql, /execute v_rewritten;/);

  assert.doesNotMatch(sql, /\bgrant\b/i);
  assert.doesNotMatch(sql, /\bsecurity\s+invoker\b/i);
  assert.doesNotMatch(sql, /\balter\s+role\b/i);
  assert.doesNotMatch(sql, /\bauth\./i);
  assert.doesNotMatch(sql, /\bvault\.(?:create_secret|update_secret)\b/i);
  assert.doesNotMatch(sql, /\bselect\s+decrypted_secret\b/i);

  const tokenLiteralPattern = /sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}/;
  assert.doesNotMatch(sql, tokenLiteralPattern, "Migration must not contain token-like literals");
  assert.doesNotMatch(testSource, tokenLiteralPattern, "Test must not contain token-like literals");
});

test("Catalog RPC migration still resolves Supabase tokens via credential_refs and Vault", () => {
  assert.match(
    catalogSql,
    /create or replace function public\.get_supabase_control_accounts\(p_organization_id uuid\)/i,
  );
  assert.match(catalogSql, /join public\.credential_refs credential/i);
  assert.match(catalogSql, /join vault\.decrypted_secrets secret/i);
  assert.match(catalogSql, /credential\.secret_ref ~ '\^vault:\/\/\[0-9a-fA-F-\]\{36\}\$'/);
  assert.match(catalogSql, /and installation\.provider = 'supabase'/i);
});

test("Supabase Management PAT preference migration executes idempotently, preserves ACLs, skips missing targets, and fails closed on drift", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`
      create schema if not exists private;
      create role service_role nologin;
      create role authenticated nologin;
    `);

    // 1. Missing functions: should skip with notice and not throw.
    await db.exec(sql);

    // 2. Seed minimal stub definitions matching the live credential-selection clauses and ACLs.
    await db.exec(`
      create or replace function private.pandora_governed_provider_read_v1(
        p_organization_id uuid, p_provider text, p_action text, p_target jsonb default '{}'::jsonb
      ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, vault, auth, extensions, pg_temp as $$
      declare v_token text;
      begin
        -- where name in ('mcpmaster_supabase_account_1_pat','Supabase_access') and nullif(trim(decrypted_secret),'') is not null
        -- order by case when name='mcpmaster_supabase_account_1_pat' then 0 else 1 end limit 1;
        return jsonb_build_object('ok', true);
      end;
      $$;
      revoke all on function private.pandora_governed_provider_read_v1(uuid, text, text, jsonb) from public;
      grant execute on function private.pandora_governed_provider_read_v1(uuid, text, text, jsonb) to service_role;

      create or replace function public.pandora_chat_capability_dispatch_core_v1(
        p_organization_id uuid, p_message text, p_thread_id uuid default null, p_project_id uuid default null
      ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, vault, auth, extensions, pg_temp as $$
      begin
        -- where name in ('mcpmaster_supabase_account_1_pat','Supabase_access')
        -- order by case when name='mcpmaster_supabase_account_1_pat' then 0 else 1 end
        return jsonb_build_object('ok', true);
      end;
      $$;

      create or replace function public.pandora_chat_capability_dispatch_native_v1(
        p_organization_id uuid, p_message text, p_thread_id uuid default null, p_project_id uuid default null
      ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, vault, auth, extensions, pg_temp as $$
      begin
        -- where name in ('mcpmaster_supabase_account_1_pat','Supabase_access')
        -- order by case when name='mcpmaster_supabase_account_1_pat' then 0 else 1 end
        return jsonb_build_object('ok', true);
      end;
      $$;
      revoke all on function public.pandora_chat_capability_dispatch_native_v1(uuid, text, uuid, uuid) from public;
      grant execute on function public.pandora_chat_capability_dispatch_native_v1(uuid, text, uuid, uuid) to authenticated;

      create or replace function private.pandora_release_deploy_edge_from_github_20260829(
        p_commit_sha text, p_slug text
      ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, vault, extensions, pg_temp as $$
      begin
        -- where name in ('mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')
        -- order by case name when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end
        return jsonb_build_object('deployed', true);
      end;
      $$;

      create or replace function private.pandora_memory_release_deploy_projectos_bridge_20260904(
        p_commit_sha text
      ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, vault, extensions, pg_temp as $$
      begin
        -- where name in ('mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')
        -- order by case name when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end
        return jsonb_build_object('deployed', true);
      end;
      $$;
    `);

    await db.exec(sql);
    // 3. Re-run to verify idempotency.
    await db.exec(sql);

    const checkRead = await db.query(`
      select
        pg_get_functiondef('private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)'::regprocedure) as def,
        has_function_privilege('service_role', 'private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)', 'EXECUTE') as svc_exec,
        has_function_privilege('authenticated', 'private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)', 'EXECUTE') as auth_exec
    `);
    assert.match(
      checkRead.rows[0].def,
      /order by case when name='Supabase_access' then 0 else 1 end/,
    );
    assert.equal(checkRead.rows[0].svc_exec, true);
    assert.equal(checkRead.rows[0].auth_exec, false);

    const checkDeploy = await db.query(`
      select pg_get_functiondef('private.pandora_release_deploy_edge_from_github_20260829(text, text)'::regprocedure) as def
    `);
    assert.match(
      checkDeploy.rows[0].def,
      /where name in \('Supabase_access','mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat'\)/,
    );
    assert.match(
      checkDeploy.rows[0].def,
      /order by case name when 'Supabase_access' then 0 when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end/,
    );

    // 4. Drift check: unexpected body without expected snippet must fail closed.
    await db.exec(`
      create or replace function private.pandora_memory_release_deploy_projectos_bridge_20260904(
        p_commit_sha text
      ) returns jsonb language plpgsql security definer as $$
      begin
        return jsonb_build_object('drifted', true);
      end;
      $$;
    `);
    await assert.rejects(
      db.exec(sql),
      /Expected deploy broker credential snippet missing/,
    );
  } finally {
    await db.close();
  }
});

