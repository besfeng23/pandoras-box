# Supabase Management PAT Vault Credential Map & Rotation

## Credential Map

Pandora resolves Supabase Management API (`https://api.supabase.com/v1`) credentials exclusively from Supabase Vault (`vault.decrypted_secrets`). Never store Management PATs in Vercel environment variables, GitHub secrets, source files, or client code.

### 1. Vercel MCP Adapter Path (`src/tools/supabase.js`, `src/tools/provider-api.js`)
- Calls the Edge Function `mcpmaster-supabase-control` (`action: "catalog"`).
- Invokes the `SECURITY DEFINER` RPC `public.get_supabase_control_accounts(p_organization_id uuid)` (`supabase/migrations/20260728194505_add_control_catalog_scopes.sql`).
- Joins `public.connector_installations` (`provider = 'supabase'`, `status = 'active'`) -> `public.credential_refs` (`rotation_state = 'current'`, `secret_ref = 'vault://<uuid>'`) -> `vault.decrypted_secrets`.
- Both production Supabase connector installations point to Vault secret **`Supabase_access`** (UUID `95a68946-5d91-4b01-b469-b39c5a77622d`), which holds the owner's broad Management PAT covering both Supabase organizations.

### 2. Database-Side Governed Adapters
With migration `supabase/migrations/20261018120000_pandora_supabase_management_pat_vault_preference_v1.sql`, the database-side Management API adapters prefer `Supabase_access` first and keep legacy account PAT secret names only as fallbacks:

| Function | Candidate Vault Names | Preference Order |
| --- | --- | --- |
| `private.pandora_governed_provider_read_v1(uuid, text, text, jsonb)` | `Supabase_access`, `mcpmaster_supabase_account_1_pat` | `Supabase_access` (0), `mcpmaster_supabase_account_1_pat` (1) |
| `public.pandora_chat_capability_dispatch_core_v1(uuid, text, uuid, uuid)` | `Supabase_access`, `mcpmaster_supabase_account_1_pat` | `Supabase_access` (0), `mcpmaster_supabase_account_1_pat` (1) |
| `public.pandora_chat_capability_dispatch_native_v1(uuid, text, uuid, uuid)` | `Supabase_access`, `mcpmaster_supabase_account_1_pat` | `Supabase_access` (0), `mcpmaster_supabase_account_1_pat` (1) |
| `private.pandora_release_deploy_edge_from_github_20260829(text, text)` | `Supabase_access`, `mcpmaster_supabase_account_1_pat`, `mcpmaster_supabase_account_2_pat` | `Supabase_access` (0), `mcpmaster_supabase_account_1_pat` (1), `mcpmaster_supabase_account_2_pat` (2) |
| `private.pandora_memory_release_deploy_projectos_bridge_20260904(text)` | `Supabase_access`, `mcpmaster_supabase_account_1_pat`, `mcpmaster_supabase_account_2_pat` | `Supabase_access` (0), `mcpmaster_supabase_account_1_pat` (1), `mcpmaster_supabase_account_2_pat` (2) |

This matches the preference order already used by `private.pandora_worker_e_verify_runtime_20260829`, `private.pandora_worker_e_verify_supabase_preview_20260830`, and `private.pandora_worker_f_resume_exact_preview_20260830`.

## Root Cause of Prior "Lacking Permission" (HTTP 403) Failures

While `public.get_supabase_control_accounts` resolved the broad Management PAT from `Supabase_access`, the five database-side governed adapters above ordered `mcpmaster_supabase_account_1_pat` ahead of `Supabase_access` (or omitted `Supabase_access` altogether in the two Edge deploy brokers):
- `mcpmaster_supabase_account_1_pat` only has visibility into organization `hcnwqoagmembvbkywwxb` and returns HTTP `403` on projects in the PLP organization.
- `mcpmaster_supabase_account_2_pat` returns HTTP `403` on every `pandoras-box` project.

Preferring `Supabase_access` first aligns the database-side governed adapters with the canonical Vault secret used by `public.credential_refs`.

## Rotation Rule

- Always rotate the canonical Management PAT **in place** inside Supabase Vault using `vault.update_secret` against the existing `Supabase_access` secret (`95a68946-5d91-4b01-b469-b39c5a77622d`) so that `public.credential_refs.secret_ref` (`vault://95a68946-5d91-4b01-b469-b39c5a77622d`) and name-based lookups (`name = 'Supabase_access'`) remain valid without rebinding rows.
- Never place Management PAT values in `.env` files, Vercel environment variables, GitHub Actions secrets, SQL migrations, or client/repository code.

## Governed Apply Steps

1. Merge the forward migration `supabase/migrations/20261018120000_pandora_supabase_management_pat_vault_preference_v1.sql` to `main` after independent review.
2. Apply the migration to the control-plane database (`jcyqixttuebxqqfkjonq`) **only** through the governed migration path after owner approval.
3. No Supabase Edge Function redeployment or Vercel redeployment is required for this change because both the catalog RPC and the rewritten adapters execute inside Postgres and read live from `vault.decrypted_secrets`.
