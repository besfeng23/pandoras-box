"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonical = path.join(root, "supabase/functions/pandora-owner-api");
const index = fs.readFileSync(path.join(canonical, "index.ts"), "utf8");

test("canonical Owner API exposes truthful idle Build Theatre state", () => {
  assert.ok(index.includes("BUILD_THEATRE_STAGE_CONTRACT"));
  assert.ok(index.includes('source: "pandora_project_experience_projection"'));
  assert.ok(index.includes('mode: "idle"'));
  assert.ok(index.includes("ownerStage: null"));
  assert.ok(index.includes("progressPercent: null"));
  assert.ok(index.includes("What do you want to build?"));
});

test("active Build Theatre values come only from the canonical theatre projection", () => {
  assert.ok(index.includes('from("pandora_build_theatre_projection")'));
  assert.ok(index.includes('source: "pandora_build_theatre_projection"'));
  assert.ok(index.includes("progressPercent: numberValue(theatre.progress_percent)"));
  assert.ok(index.includes("ownerStage: textValue(theatre.owner_stage) || null"));
  assert.ok(index.includes("buildTheatre: buildTheatreSummary(experience.data, theatre.data)"));
});

test("canonical Owner API source contains no embedded provider credential", () => {
  assert.doesNotMatch(index, /github_pat_|ghp_|sk-proj-/i);
  assert.doesNotMatch(index, /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i);
});
