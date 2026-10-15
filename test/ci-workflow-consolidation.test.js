'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workflowsDir = path.join(root, '.github/workflows');
const read = (name) => fs.readFileSync(path.join(workflowsDir, name), 'utf8');

test('repository uses only the five canonical CI and release workflows', () => {
  const names = fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name)).sort();
  assert.deepEqual(names, ['canonical-release-evidence.yml','ci-governance.yml','ci-mobile.yml','ci-operations.yml','ci-platform.yml']);
});

test('required status contexts remain present after consolidation', () => {
  const release = read('canonical-release-evidence.yml');
  const platform = read('ci-platform.yml');
  const mobile = read('ci-mobile.yml');
  const governance = read('ci-governance.yml');
  assert.match(release, /name: canonical-release-source-contract/);
  assert.match(platform, /plat_node24_node24:\n\s+name: node24/);
  assert.match(platform, /name: Windows worker contract/);
  assert.match(mobile, /name: Exact source \/ Flutter \/ Android/);
  assert.match(mobile, /name: Exact source \/ Flutter \/ iOS/);
  assert.match(mobile, /name: Exact source \/ PLP native Android/);
  assert.match(mobile, /name: Exact source \/ Euro-Fish native Android/);
  assert.match(governance, /name: Dependency review/);
});

test('root npm manifest changes alone do not trigger mobile native builds', () => {
  const mobile = read('ci-mobile.yml');
  const start = mobile.indexOf('  mob_integration_mobile-impact:');
  const end = mobile.indexOf('  mob_integration_verify_android_heavy:', start);
  assert.ok(start >= 0 && end > start, 'mobile impact detector must exist');
  const detector = mobile.slice(start, end);
  assert.match(detector, /apps\/pandora-mobile\/\*/);
  assert.doesNotMatch(detector, /package\.json|package-lock\.json/);
});

test('Operations Runtime Seams Flutter tests are path-scoped', () => {
  const operations = read('ci-operations.yml');
  assert.match(operations, /operations_runtime_seams_mobile_events: \$\{\{ steps\.detect\.outputs\.operations_runtime_seams_mobile_events \}\}/);
  assert.match(operations, /mobile_event_scope = .*apps\/pandora-mobile\/\*\*/);
  const lines = operations.split('\n');
  const start = lines.findIndex((line) => /^  ops_seams_mobile-events:/.test(line));
  assert.ok(start >= 0, 'mobile-events job must exist');
  const next = lines.findIndex((line, index) => index > start && /^  [A-Za-z0-9_-]+:/.test(line));
  const job = lines.slice(start, next < 0 ? lines.length : next).join('\n');
  assert.match(job, /needs\.detect_scopes\.outputs\.operations_runtime_seams_mobile_events == 'true'/);
});

test('Task 146 production deployment remains manual and exact-source', () => {
  const platform = read('ci-platform.yml');
  assert.match(platform, /deploy_production:/);
  assert.match(platform, /platform_prebuilt_production:\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.deploy_production == true && inputs\.source_sha != '' \}\}/);
  assert.match(platform, /SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(platform, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
});
