"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");

const { createOperatorApiApp } = require("../../../src/operator/api.js");

const MCP_AUTH_URL = "https://ezevdupejriywcwqaskl.supabase.co";
const TOKEN = "pandora-mcp-auth-route-test-access-token";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";
const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";

async function withServer(app, action) {
  const server = await new Promise((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  try {
    return await action(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function appFor({ membership = { organizationId: ORGANIZATION_ID, userId: USER_ID, role: "owner" }, servicesFactory } = {}) {
  const app = express();
  app.use(express.json());
  app.use(createOperatorApiApp({
    authenticator: {
      async authenticate() {
        throw new Error("Sydney operator authentication must not be used for Pandora MCP consent");
      },
    },
    membershipResolver: {
      async resolve() {
        throw new Error("Sydney operator membership must not be used for Pandora MCP consent");
      },
    },
    organizationId: ORGANIZATION_ID,
    supabaseUrl: "https://jcyqixttuebxqqfkjonq.supabase.co",
    supabasePublishableKey: "sydney-public-test-key",
    allowedOrigins: ["https://mcpmaster.vercel.app"],
    requestsPerMinute: 100,
    runtimeFactory: () => express.Router(),
    pandoraMcpAuthServices: servicesFactory || (() => ({
      supabaseUrl: MCP_AUTH_URL,
      supabasePublishableKey: "pandora-mcp-public-test-key",
      organizationId: ORGANIZATION_ID,
      authenticator: {
        async authenticate(header) {
          assert.equal(header, `Bearer ${TOKEN}`);
          return {
            userId: USER_ID,
            email: "markjohnsonbanatao888@gmail.com",
            accessToken: TOKEN,
          };
        },
      },
      membershipResolver: {
        async resolve(organizationId, userId, accessToken) {
          assert.equal(organizationId, ORGANIZATION_ID);
          assert.equal(userId, USER_ID);
          assert.equal(accessToken, TOKEN);
          return membership;
        },
      },
    })),
  }));
  return app;
}

test("Pandora MCP consent config returns only the isolated dedicated Pandora MCP Auth settings", async () => {
  await withServer(appFor(), async (origin) => {
    const response = await fetch(`${origin}/pandora-mcp-auth/config`, { cache: "no-store" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.supabaseUrl, MCP_AUTH_URL);
    assert.equal(body.supabasePublishableKey, "pandora-mcp-public-test-key");
    assert.equal(body.organizationId, ORGANIZATION_ID);
    assert.equal(body.sessionStorage, "memory-only");
  });
});

test("Pandora MCP consent session validates the Pandora MCP user and active membership without Sydney auth", async () => {
  await withServer(appFor(), async (origin) => {
    const response = await fetch(`${origin}/pandora-mcp-auth/session`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      user: { id: USER_ID, email: "markjohnsonbanatao888@gmail.com", role: "owner" },
    });
  });
});

test("Pandora MCP consent session rejects users without an active isolated membership", async () => {
  await withServer(appFor({ membership: null }), async (origin) => {
    const response = await fetch(`${origin}/pandora-mcp-auth/session`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "PANDORA_MCP_MEMBERSHIP_REQUIRED");
  });
});

test("Pandora MCP consent configuration failures do not expose environment values", async () => {
  await withServer(appFor({
    servicesFactory: () => {
      throw new Error("sb_publishable_secret_must_not_be_returned");
    },
  }), async (origin) => {
    const response = await fetch(`${origin}/pandora-mcp-auth/config`, { cache: "no-store" });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /sb_publishable_secret_must_not_be_returned/);
  });
});
