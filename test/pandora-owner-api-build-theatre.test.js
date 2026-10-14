"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonical = path.join(root, "supabase/functions/pandora-owner-api");
const index = fs.readFileSync(path.join(canonical, "index.ts"), "utf8");

test("canonical Owner API exposes truthful idle Build Theatre state", () => {
  assert.match(index, /BUILD_THEATRE_STAGE_CONTRACT/);
  assert.match(index, /source: "pandora_project_experience_projection",[\\s\\S]*mode: "idle"/);
  assert.match(index, /mode: "idle"[\\s\\S]*ownerStage: null,[\\s\\S]*progressPercent: null/);
  assert.match(index, /"What do you want to build\\?"/);
});

test("active Build Theatre values come only from the canonical theatre projection", () => {
  assert.match(index, /from\\("pandora_build_theatre_projection"\\)/);
  assert.match(index, /source: "pandora_build_theatre_projection"/);
  assert.match(index, /progressPercent: numberValue\\(theatre\\.progress_percent\\)/);
  assert.match(index, /ownerStage: textValue\\(theatre\\.owner_stage\\) \\|\\| null/);
  assert.match(index, /buildTheatre: buildTheatreSummary\\(experience\\.data, theatre\\.data\\)/);
});

test("canonical Owner API source contains no embedded provider credential", () => {
  assert.doesNotMatch(index, /github_pat_|ghp_|sk-proj-|service_role\\s*[:=]\\s*["''][A-Za-z0-9._-]{20,}/i);
});
