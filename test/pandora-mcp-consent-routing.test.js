"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");

const browser = readFileSync("public/oauth/consent.browser.js.txt", "utf8");
const consentApi = readFileSync("api/oauth-consent.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

test("Pandora MCP OAuth consent selects the dedicated Pandora MCP config and session endpoints only for its auth mode", () => {
  assert.match(browser, /window\.location\.pathname === '\/oauth\/pandora-mcp-consent'/);
  assert.match(vercel, /"source": "\/oauth\/pandora-mcp-consent"/);
  assert.match(browser, /\/api\/operator\/pandora-mcp-auth\/config/);
  assert.match(browser, /\/api\/operator\/pandora-mcp-auth\/session/);
  assert.match(browser, /\/api\/operator\/auth\/config/);
  assert.match(browser, /\/api\/operator\/session/);
});

test("OAuth consent CSP permits both legacy operator and isolated Pandora MCP Supabase Auth origins", () => {
  assert.match(consentApi, /https:\/\/jcyqixttuebxqqfkjonq\.supabase\.co/);
  assert.match(consentApi, /https:\/\/ezevdupejriywcwqaskl\.supabase\.co/);
});
