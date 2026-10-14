# Bubble Pandora Enterprise Alignment

**Status:** Active mapping (created 2026-10-15)
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

## Existing Alignment Points

- Integration option set already includes Supabase, GitHub App, Vercel, PayPal, PostHog.
- Tenant model aligns with multi-tenant organizations + memberships.
- Audit events align with append-only audit tables.
- Open PRs #1015–1018 document architecture, CORS, and integration plans.

## Changes Applied in Bubble (test)

- Added external ID / linking fields to Tenant, User, Integration, and Audit.
- Created new **Pandora Project** data type for explicit project-level linkage.

## Next Steps (governed)

1. Populate external IDs from live Supabase reads when creating/updating Tenant or Integration records.
2. Land PR #1018 (Bubble Enterprise CORS origin) if not already applied.
3. Add Bubble API connector workflows that call Supabase Edge Functions under the governed path.
4. Keep Bubble as the UI/control surface; never treat it as source of truth over verified provider evidence.

Evidence authority remains the authenticated `GET /api/operator/status` pack. This document is a mapping aid only.
