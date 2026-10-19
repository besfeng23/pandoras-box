-- Migration: repoint_github_app_installation_besfeng23
-- Approved by Mark Johnson 2026-10-20 00:24 PHT.
-- Re-point Pandora's GitHub App (app id 4785021, slug pandoras-box-mcp) to installation 173093145 on besfeng23.

-- (a) Same function, only installationId changed. CREATE OR REPLACE keeps owner (postgres) and ACL
--     (postgres=X, service_role=X; PUBLIC already revoked); SECURITY DEFINER + search_path '' unchanged.
CREATE OR REPLACE FUNCTION public.pandora_get_github_app_runtime_material()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_private_key text;
begin
  select decrypted_secret into strict v_private_key
  from vault.decrypted_secrets
  where name='Github_app_private_key'
  limit 1;

  if v_private_key not like '-----BEGIN RSA PRIVATE KEY%END RSA PRIVATE KEY-----%'
     and v_private_key not like '-----BEGIN PRIVATE KEY%END PRIVATE KEY-----%' then
    raise exception 'GitHub App private key is not a PEM private key' using errcode='22023';
  end if;

  return jsonb_build_object(
    'appId', 4785021,
    'installationId', 173093145,
    'privateKeyPem', v_private_key
  );
end;
$function$;

-- (b)+(c) Connector config row (provider github, id ae8d520f-...). Guarded on the old installation id.
UPDATE public.connector_installations
SET configuration = configuration
      || jsonb_build_object(
           'github_app_installation_id', 173093145,
           'installation_account', 'besfeng23',
           'repository_selection', 'selected',
           'canonical_repository', 'besfeng23/pandoras-box',
           'allowed_repositories', jsonb_build_array(
              'besfeng23/pandoras-box',
              'besfeng23/Plp',
              'pandora-rvw-314296438-20260820/pandoras-box-memory'
           )
         )
WHERE id = 'ae8d520f-5b98-411e-81fc-f756a4439e6a'
  AND provider = 'github'
  AND (configuration->>'github_app_installation_id') = '158056492';

-- Guard: fail only if the prod row exists and is still not re-pointed. Fresh replay
-- databases (CI) do not contain this row, so the guard is a no-op there.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.connector_installations
    WHERE id = 'ae8d520f-5b98-411e-81fc-f756a4439e6a'
      AND (configuration->>'github_app_installation_id') IS DISTINCT FROM '173093145'
  ) THEN
    RAISE EXCEPTION 'github connector row was not re-pointed';
  END IF;
END $$;
