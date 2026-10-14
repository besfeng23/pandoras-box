# Bubble Pandora Enterprise Alignment

**Status:** Active mapping + sample data (updated 2026-10-15)
**Bubble app:** `pandora-enterprise` (test version)
**Canonical GitHub:** `pandora-rvw-314296438-20260820/pandoras-box`
**Supabase projects:**
- Core: `jcyqixttuebxqqfkjonq` (pandoras-box)
- Memory: `ivmvufhcsezyhczzondn` (pandoras-box-memory)

## Data Type Mapping

| Bubble Type | Key Fields Added | Maps To |
|-------------|------------------|---------|
| Tenant | `supabase_organization_id_text`, `github_repository_text`, `memory_project_id_text` | Supabase `organizations.id`, GitHub repo full name, Memory project |
| User | `supabase_user_id_text` | Supabase `auth.users.id` |
| Integration | `external_id_text`, `last_sync_date` | Connector installation ID / status in Supabase |
| Audit event | `supabase_audit_id_text` | Supabase `audit_events` or `audit_logs` |
| Pandora Project (new) | `name_text`, `github_repository_text`, `supabase_project_id_text`, `status_text`, `tenant_custom_tenant`, `memory_namespace_text` | projectos_projects + memory namespace |

## Sample Records Created (test version, 2026-10-15)

### Tenants linked to live Supabase organizations

| Name | Supabase Organization ID | GitHub Repository |
|------|--------------------------|-------------------|
| MCPMaster Staging | 2270b266-59da-4c39-bfd9-9f8d08352af0 | pandora-rvw-314296438-20260820/pandoras-box |
| PLP Boracay | 076a9306-5c4e-4d9d-98d3-e3a6fea968fb | pandora-rvw-314296438-20260820/pandoras-box |
| 1064 Euro-Fish Traders | 3a30dc21-cb5d-43ed-b212-80dfe1433707 | pandora-rvw-314296438-20260820/pandoras-box |
| Batalla & Associates | 47c91446-86da-4782-8197-3fd841d91275 | pandora-rvw-314296438-20260820/pandoras-box |
| BOK | 4e2ca552-f792-4961-8aec-46b47f318629 | pandora-rvw-314296438-20260820/pandoras-box |

### Pandora Projects

- Pandoras Box Core → GitHub `pandoras-box`, Supabase `jcyqixttuebxqqfkjonq`
- Pandoras Box Memory → GitHub `pandoras-box-memory`, Supabase `ivmvufhcsezyhczzondn`

### Integrations

- Supabase (external ID = core project ref, status Connected)
- GitHub App (external ID = canonical repo, status Connected)

## Existing Alignment Points

- Integration option set already includes Supabase, GitHub App, Vercel, PayPal, PostHog.
- Tenant model aligns with multi-tenant organizations + memberships.
- Audit events align with append-only audit tables.
- Open PRs #1015–1018 document architecture, CORS, and integration plans.

## Changes Applied in Bubble (test)

- Added external ID / linking fields to Tenant, User, Integration, and Audit.
- Created new **Pandora Project** data type for explicit project-level linkage.
- Populated sample tenants from live Supabase `organizations` read.
- Added matching project and integration records.

## Next Steps (governed)

1. Land PR #1018 (Bubble Enterprise CORS origin) if not already applied.
2. Add Bubble API connector workflows that call Supabase Edge Functions under the governed path.
3. Keep Bubble as the UI/control surface; never treat it as source of truth over verified provider evidence.

Evidence authority remains the authenticated `GET /api/operator/status` pack. This document is a mapping aid only.
