-- Pandora Supabase connector policy widen v1
-- Purpose: Widen the governed Supabase connector policy in public.connector_installations
-- for both canonical accounts (`pandoras-box` = d3ea6e4a-a631-4599-86b0-cdf2e396eea1 and
-- `pandoras-box-memory` = 51489801-4e6e-49d8-aeac-abc1d749a1ab) to include project Plp
-- (`xyefkykwuppbweabvvmk`), both organization slugs (`hcnwqoagmembvbkywwxb` and
-- `ebfctewrnfobwgypfyer`), and scopes `organizations:read` and `auth:read` alongside
-- `projects:read` and `projects:write`.
-- Owner approval: Explicitly approved by the owner (Mark) on 2026-10-18.
-- Rollback: Restore scopes to array['projects:read','projects:write']::text[], restore
-- the single-ref allowed_project_refs per row (`['jcyqixttuebxqqfkjonq']` for
-- d3ea6e4a-a631-4599-86b0-cdf2e396eea1 and `['ivmvufhcsezyhczzondn']` for
-- 51489801-4e6e-49d8-aeac-abc1d749a1ab), and remove `organization_slugs` from
-- configuration (`configuration - 'organization_slugs'`).

do $pandora_supabase_connector_policy_widen$
declare
  v_present integer;
  v_rows integer;
begin
  select count(*)::integer into v_present
  from public.connector_installations
  where id in (
    'd3ea6e4a-a631-4599-86b0-cdf2e396eea1',
    '51489801-4e6e-49d8-aeac-abc1d749a1ab'
  )
    and provider = 'supabase';

  if v_present < 2 then
    raise notice 'Canonical Supabase connector installation rows are not both present in this replay environment (found %); policy widening is skipped', v_present;
    return;
  end if;

  update public.connector_installations
     set scopes = array['projects:read','projects:write','organizations:read','auth:read']::text[],
         configuration = configuration || jsonb_build_object(
           'allowed_project_refs', jsonb_build_array(
             'jcyqixttuebxqqfkjonq',
             'ivmvufhcsezyhczzondn',
             'xyefkykwuppbweabvvmk'
           ),
           'organization_slugs', jsonb_build_array(
             'hcnwqoagmembvbkywwxb',
             'ebfctewrnfobwgypfyer'
           )
         ),
         updated_at = timezone('utc', now())
   where id in (
     'd3ea6e4a-a631-4599-86b0-cdf2e396eea1',
     '51489801-4e6e-49d8-aeac-abc1d749a1ab'
   )
     and provider = 'supabase';

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception 'Expected to widen exactly 2 Supabase connector_installations rows, updated %', v_rows
      using errcode = '55000';
  end if;
end;
$pandora_supabase_connector_policy_widen$;
