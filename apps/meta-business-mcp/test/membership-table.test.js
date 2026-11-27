"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  SupabaseOrganizationMembershipResolver,
} = require("../dist/auth/membership.js");

const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";
const ACCESS_TOKEN = "pandora-mcp-membership-test-access-token-long-enough";

test("membership resolver can target an isolated Pandora MCP membership table", async () => {
  let requestedUrl;
  const resolver = new SupabaseOrganizationMembershipResolver({
    supabaseUrl: "https://ezevdupejriywcwqaskl.supabase.co",
    publishableKey: "test-public-key",
    tableName: "pandora_mcp_memberships",
    fetchFn: async (url) => {
      requestedUrl = new URL(String(url));
      return new Response(JSON.stringify([{
        organization_id: ORGANIZATION_ID,
        user_id: USER_ID,
        role: "owner",
        status: "active",
      }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const membership = await resolver.resolve(ORGANIZATION_ID, USER_ID, ACCESS_TOKEN);
  assert.equal(requestedUrl.pathname, "/rest/v1/pandora_mcp_memberships");
  assert.equal(requestedUrl.searchParams.get("organization_id"), `eq.${ORGANIZATION_ID}`);
  assert.equal(requestedUrl.searchParams.get("user_id"), `eq.${USER_ID}`);
  assert.deepEqual(membership, { organizationId: ORGANIZATION_ID, userId: USER_ID, role: "owner" });
});

test("membership resolver rejects unsafe table names", () => {
  assert.throws(() => new SupabaseOrganizationMembershipResolver({
    supabaseUrl: "https://ezevdupejriywcwqaskl.supabase.co",
    publishableKey: "test-public-key",
    tableName: "memberships?select=*",
  }), /membership table name is invalid/);
});
