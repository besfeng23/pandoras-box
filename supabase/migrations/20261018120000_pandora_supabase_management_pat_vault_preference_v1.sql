-- Pandora Supabase Management PAT Vault preference v1
-- Purpose: Prefer the canonical Vault Management PAT (`Supabase_access`) in
-- database-side governed Supabase Management API adapters, keeping legacy
-- account PAT names (`mcpmaster_supabase_account_1_pat`,
-- `mcpmaster_supabase_account_2_pat`) only as fallbacks.
-- Governance: Must be applied only through the governed migration path after
-- owner approval.
-- Security invariant: Rewrites only the Vault credential-preference clauses
-- in place via pg_get_functiondef() + replace(). Does not modify function
-- ownership, definer execution mode, search_path, role privileges, allowlists,
-- resource checks, or authentication configuration, and never returns secret
-- material to callers.

do $pandora_supabase_pat_pref$
declare
  v_target text;
  v_proc regprocedure;
  v_def text;
  v_rewritten text;

  v_old_order_a constant text :=
    $s$order by case when name='mcpmaster_supabase_account_1_pat' then 0 else 1 end$s$;
  v_new_order_a constant text :=
    $s$order by case when name='Supabase_access' then 0 else 1 end$s$;

  v_old_where_b constant text :=
    $s$where name in ('mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')$s$;
  v_new_where_b constant text :=
    $s$where name in ('Supabase_access','mcpmaster_supabase_account_1_pat','mcpmaster_supabase_account_2_pat')$s$;
  v_old_order_b constant text :=
    $s$order by case name when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end$s$;
  v_new_order_b constant text :=
    $s$order by case name when 'Supabase_access' then 0 when 'mcpmaster_supabase_account_1_pat' then 1 else 2 end$s$;
begin
  foreach v_target in array array[
    'private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)',
    'public.pandora_chat_capability_dispatch_core_v1(uuid, text, uuid, uuid)',
    'public.pandora_chat_capability_dispatch_native_v1(uuid, text, uuid, uuid)'
  ]
  loop
    v_proc := to_regprocedure(v_target);
    if v_proc is null then
      raise notice 'Skipping missing function %', v_target;
      continue;
    end if;

    v_def := pg_get_functiondef(v_proc);
    if strpos(v_def, v_new_order_a) > 0 and strpos(v_def, v_old_order_a) = 0 then
      raise notice 'Function % already prefers Supabase_access; skipping', v_target;
      continue;
    end if;

    if strpos(v_def, v_old_order_a) = 0 then
      raise exception 'Expected credential preference snippet missing in %', v_target
        using errcode = '55000';
    end if;

    v_rewritten := replace(v_def, v_old_order_a, v_new_order_a);
    if strpos(v_rewritten, v_new_order_a) = 0 or strpos(v_rewritten, v_old_order_a) > 0 then
      raise exception 'Failed to rewrite credential preference in %', v_target
        using errcode = '55000';
    end if;

    execute v_rewritten;
  end loop;

  foreach v_target in array array[
    'private.pandora_release_deploy_edge_from_github_20260829(text, text)',
    'private.pandora_memory_release_deploy_projectos_bridge_20260904(text)'
  ]
  loop
    v_proc := to_regprocedure(v_target);
    if v_proc is null then
      raise notice 'Skipping missing function %', v_target;
      continue;
    end if;

    v_def := pg_get_functiondef(v_proc);
    if strpos(v_def, v_new_where_b) > 0
       and strpos(v_def, v_new_order_b) > 0
       and strpos(v_def, v_old_where_b) = 0
       and strpos(v_def, v_old_order_b) = 0 then
      raise notice 'Function % already prefers Supabase_access; skipping', v_target;
      continue;
    end if;

    if strpos(v_def, v_old_where_b) = 0 or strpos(v_def, v_old_order_b) = 0 then
      raise exception 'Expected deploy broker credential snippet missing in %', v_target
        using errcode = '55000';
    end if;

    v_rewritten := replace(
      replace(v_def, v_old_where_b, v_new_where_b),
      v_old_order_b,
      v_new_order_b
    );
    if strpos(v_rewritten, v_new_where_b) = 0
       or strpos(v_rewritten, v_new_order_b) = 0
       or strpos(v_rewritten, v_old_where_b) > 0
       or strpos(v_rewritten, v_old_order_b) > 0 then
      raise exception 'Failed to rewrite deploy broker credential preference in %', v_target
        using errcode = '55000';
    end if;

    execute v_rewritten;
  end loop;
end;
$pandora_supabase_pat_pref$;
