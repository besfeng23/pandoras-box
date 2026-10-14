'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonical = path.join(root, 'supabase/functions/pandora-owner-api');
const removedPatchDirectories = [
  'ops/supabase/runtime-patches/pandora-owner-api-v76-base44-build-theatre',
  'ops/supabase/runtime-patches/pandora-owner-api-v100-cors-enterprise-omega',
  'docs/supabase/runtime-patch-archive/pandora-owner-api-v76-base44-build-theatre',
  'docs/supabase/runtime-patch-archive/pandora-owner-api-v100-cors-enterprise-omega',
];

test('canonical Owner API includes the historical Build Theatre and CORS behavior', () => {
  const index = fs.readFileSync(path.join(canonical, 'index.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(canonical, 'contract.ts'), 'utf8');
  assert.ok(index.includes('buildTheatreSummary'));
  assert.ok(index.includes('pandora_build_theatre_projection'));
  assert.ok(index.includes('ownerStage: null'));
  assert.ok(contract.includes('https://enterprise-omega-five.vercel.app'));
});

test('redundant runtime-patch copies are deleted rather than archived in the working tree', () => {
  for (const relativePath of removedPatchDirectories) {
    assert.equal(
      fs.existsSync(path.join(root, relativePath)),
      false,
      'deprecated patch directory must be absent: ' + relativePath,
    );
  }
});

test('source consolidation documentation identifies Git history as the archive', () => {
  const doc = fs.readFileSync(path.join(canonical, 'SOURCE_CONSOLIDATION.md'), 'utf8');
  assert.ok(doc.includes('Git history preserves the earlier patch revisions'));
  assert.ok(doc.includes('does not claim deployed-source equivalence'));
  assert.equal(doc.includes('runtime-patch-archive'), false);
});
