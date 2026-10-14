'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonical = path.join(root, 'supabase/functions/pandora-owner-api');
const archiveV76 = path.join(root, 'docs/supabase/runtime-patch-archive/pandora-owner-api-v76-base44-build-theatre');
const archiveV100 = path.join(root, 'docs/supabase/runtime-patch-archive/pandora-owner-api-v100-cors-enterprise-omega');

test('canonical Owner API source contains the historical v76 and v100 deltas', () => {
  const index = fs.readFileSync(path.join(canonical, 'index.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(canonical, 'contract.ts'), 'utf8');
  assert.ok(index.includes('buildTheatreSummary'));
  assert.ok(index.includes('pandora_build_theatre_projection'));
  assert.ok(index.includes('ownerStage: null'));
  assert.ok(contract.includes('https://enterprise-omega-five.vercel.app'));
  assert.equal(fs.existsSync(path.join(canonical, 'SOURCE_CONSOLIDATION.md')), true);
});

test('v76 source remains preserved as historical evidence and its contract test uses the archive', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(archiveV76, 'manifest.json'), 'utf8'));
  const index = Buffer.from(fs.readFileSync(path.join(archiveV76, 'index.ts.base64'), 'utf8').trim(), 'base64').toString('utf8');
  const oldTest = fs.readFileSync(path.join(root, 'test/base44-owner-api-v76-theatre-artifact.test.js'), 'utf8');
  assert.equal(manifest.provider.baselineVersion, 76);
  assert.equal(manifest.files.find((file) => file.name === 'index.ts').blob, '285b10e929defc700fceb16a9e393592ffd37e2c');
  assert.ok(index.includes('pandora_build_theatre_projection'));
  assert.ok(oldTest.includes('docs/supabase/runtime-patch-archive/pandora-owner-api-v76-base44-build-theatre'));
});

test('v100 archive records deployment identity and is not canonical runtime input', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(archiveV100, 'manifest.json'), 'utf8'));
  const contract = fs.readFileSync(path.join(archiveV100, 'contract.ts'), 'utf8');
  assert.equal(manifest.provider.deployedVersion, 100);
  assert.equal(manifest.files['contract.ts'].canonicalBaselineBlob, manifest.files['contract.ts'].blob);
  assert.ok(contract.includes('https://enterprise-omega-five.vercel.app'));
  assert.equal(manifest.status, 'archived-not-a-deployment-input');
  assert.equal(fs.existsSync(path.join(archiveV100, 'index.ts')), true);
});

