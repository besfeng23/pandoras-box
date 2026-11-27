"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildPandoraMcpAuthConfiguration,
  MissingConfigurationError,
} = require("../dist/runtime/service-config.js");

const MCP_AUTH_URL = "https://ezevdupejriywcwqaskl.supabase.co";
const PUBLISHABLE_KEY = ["sb", "publishable", "test", "key", "012345678901234567890"].join("_");

test("Pandora MCP Auth config is isolated to the approved Supabase project", () => {
  const config = buildPandoraMcpAuthConfiguration({
    MCPMASTER_PANDORA_MCP_SUPABASE_URL: MCP_AUTH_URL,
    MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  });
  assert.deepEqual(config, {
    supabaseUrl: MCP_AUTH_URL,
    supabasePublishableKey: PUBLISHABLE_KEY,
    organizationId: "2270b266-59da-4c39-bfd9-9f8d08352af0",
    membershipTable: "pandora_mcp_memberships",
    authorizationServer: `${MCP_AUTH_URL}/auth/v1`,
  });
});

test("Pandora MCP Auth config fails closed when either Pandora MCP environment variable is missing", () => {
  assert.throws(
    () => buildPandoraMcpAuthConfiguration({
      MCPMASTER_PANDORA_MCP_SUPABASE_URL: MCP_AUTH_URL,
    }),
    (error) => error instanceof MissingConfigurationError
      && error.message.includes("MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY"),
  );
  assert.throws(
    () => buildPandoraMcpAuthConfiguration({
      MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    }),
    (error) => error instanceof MissingConfigurationError
      && error.message.includes("MCPMASTER_PANDORA_MCP_SUPABASE_URL"),
  );
});

test("Pandora MCP Auth config rejects non-target projects without echoing their URLs", () => {
  for (const rejectedUrl of [
    "https://jcyqixttuebxqqfkjonq.supabase.co",
    "https://xyefkykwuppbweabvvmk.supabase.co",
  ]) {
    let error;
    try {
      buildPandoraMcpAuthConfiguration({
        MCPMASTER_PANDORA_MCP_SUPABASE_URL: rejectedUrl,
        MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      });
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof MissingConfigurationError);
    assert.doesNotMatch(error.message, /jcyqixttuebxqqfkjonq|xyefkykwuppbweabvvmk/);
    assert.match(error.message, /MCPMASTER_PANDORA_MCP_SUPABASE_URL/);
  }
});
