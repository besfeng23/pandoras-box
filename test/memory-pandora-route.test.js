"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { PandoraMemoryMCPServer } = require("../src/tools/memory.js");

const BASE_URL = "https://pandorasbox-memory.vercel.app";
const PROJECT_KEY = "mcpmaster-pandoras-box";
const CONFIG = {
  baseUrl: BASE_URL,
  oidcToken: "o".repeat(64),
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:health", "memory:read"],
  timeoutMs: 8000,
  maxResponseBytes: 500000,
};

function memoryPayload() {
  return {
    ok: true,
    namespace: "real_life",
    current_task: null,
    adaptive_profile: [],
    style_profile: [],
    project_context: [],
    people_context: [],
    risk_warnings: [],
    open_loops: [],
    latest_context_pack: null,
    daily_context_pack: null,
    recent_events: [],
    semantic_matches: [],
    canonical_records: [],
    approved_record_count: 0,
    requested_canon_statuses: ["hard_canon", "soft_canon"],
    retrieval_mode: "project_scoped_keyword_recency",
    retrieval_reasoning_summary: "Exact-project test response.",
    warnings: [],
  };
}

function jsonResponse(payload) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => text,
  };
}

test("PandoraMemoryMCPServer.health() and .search() use /api/pandora/* routes and never call /api/projectos/", async () => {
  const requestedUrls = [];
  const requestedMethods = [];

  const server = new PandoraMemoryMCPServer(CONFIG, async (url, init = {}) => {
    const urlString = String(url);
    requestedUrls.push(urlString);
    requestedMethods.push(init.method);

    if (urlString.includes("/api/projectos/")) {
      throw new Error(`Unexpected retired ProjectOS route requested: ${urlString}`);
    }

    if (urlString === "https://pandorasbox-memory.vercel.app/api/pandora/health") {
      return jsonResponse({
        ok: true,
        project: "pandora-memory-engine",
        status: "healthy",
      });
    }

    if (urlString === "https://pandorasbox-memory.vercel.app/api/pandora/memory/search") {
      return jsonResponse(memoryPayload());
    }

    throw new Error(`Unexpected URL requested: ${urlString}`);
  });

  const healthResult = await server.health();
  assert.equal(healthResult.ok, true);
  assert.equal(healthResult.origin, BASE_URL);

  const searchResult = await server.search({
    namespace: "real_life",
    projectKey: PROJECT_KEY,
    query: "current state",
  });
  assert.equal(searchResult.ok, true);

  assert.deepEqual(requestedUrls, [
    "https://pandorasbox-memory.vercel.app/api/pandora/health",
    "https://pandorasbox-memory.vercel.app/api/pandora/memory/search",
  ]);
  assert.deepEqual(requestedMethods, ["GET", "POST"]);
  assert.equal(
    requestedUrls.some((u) => u.includes("/api/projectos/")),
    false,
  );
});
