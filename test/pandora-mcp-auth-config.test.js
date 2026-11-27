"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildPandoraMcpAuthConfiguration,
  MissingConfigurationError,
} = require("../dist/runtime/service-config.js");

const TOKYO_URL = "https://xyefkykwuppbweabvvmk.supabase.co";
const PUBLISHABLE_KEY = ["sb", "publishable", "test", "key", "012345678901234567890"].join("_");

test("Pandora MCP Auth config is isolated to the Tokyo Supabase project", () => {
  const config = buildPandoraMcpAuthConfiguration({
    MCPMASTER_PANDORA_MCP_SUPABASE_URL: TOKYO_URL,
    MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  });
  assert.deepEqual(config, {
    supabaseUrl: TOKYO_URL,
    supabasePublishableKey: PUBLISHABLE_KEY,
    organizationId: "2270b266-59da-4c39-bfd9-9f8d08352af0",
    membershipTable: "pandora_mcp_memberships",
    authorizationServer: `${TOKYO_URL}/auth/v1`,
  });
});

test("Pandora MCP Auth config fails closed when either Tokyo environment variable is missing", () => {
  assert.throws(
    () => buildPandoraMcpAuthConfiguration({
      MCPMASTER_PANDORA_MCP_SUPABASE_URL: TOKYO_URL,
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

test("Pandora MCP Auth config rejects the restricted Sydney Supabase project without echoing its URL", () => {
  let error;
  try {
    buildPandoraMcpAuthConfiguration({
      MCPMASTER_PANDORA_MCP_SUPABASE_URL: "https://jcyqixttuebxqqfkjonq.supabase.co",
      MCPMASTER_PANDORA_MCP_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof MissingConfigurationError);
  assert.doesNotMatch(error.message, /jcyqixttuebxqqfkjonq/);
  assert.match(error.message, /MCPMASTER_PANDORA_MCP_SUPABASE_URL/);
});
