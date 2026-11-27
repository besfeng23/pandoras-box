-- Isolated membership authorization for the Pandora MCP Auth project.
-- This table is intentionally separate from PLP and Pandora Connect schemas.
CREATE TABLE IF NOT EXISTS public.pandora_mcp_memberships (
    organization_id uuid NOT NULL
        CHECK (organization_id = '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role text NOT NULL
        CHECK (role IN ('owner', 'admin', 'operator', 'member', 'viewer')),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
    PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE public.pandora_mcp_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandora_mcp_memberships FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pandora_mcp_memberships FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.pandora_mcp_memberships TO authenticated;

DROP POLICY IF EXISTS pandora_mcp_memberships_select_self
    ON public.pandora_mcp_memberships;
CREATE POLICY pandora_mcp_memberships_select_self
    ON public.pandora_mcp_memberships
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Provision Mark's owner membership only if his Auth user already exists.
-- If not, create the Auth user through the Supabase Auth Admin API first, then
-- rerun this INSERT with the newly issued Auth user UUID.
INSERT INTO public.pandora_mcp_memberships (organization_id, user_id, role, status)
SELECT
    '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid,
    users.id,
    'owner',
    'active'
FROM auth.users AS users
WHERE lower(users.email) = lower('markjohnsonbanatao888@gmail.com')
ON CONFLICT (organization_id, user_id)
DO UPDATE SET role = 'owner', status = 'active';
