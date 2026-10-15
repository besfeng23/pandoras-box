'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workflowsDir = path.join(root, '.github/workflows');
const read = (name) => fs.readFileSync(path.join(workflowsDir, name), 'utf8');

test('repository uses only the five canonical CI and release workflows', () => {
  const names = fs.readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  assert.deepEqual(names, [
    'canonical-release-evidence.yml',
    'ci-governance.yml',
    'ci-mobile.yml',
    'ci-operations.yml',
    'ci-platform.yml',
  ]);
});

test('required check names remain present after workflow consolidation', () => {
  const release = read('canonical-release-evidence.yml');
  const platform = read('ci-platform.yml');
  const mobile = read('ci-mobile.yml');
  const governance = read('ci-governance.yml');

  assert.match(release, /name: canonical-release-source-contract/);
  assert.match(platform, /name: node24/);
  assert.match(platform, /name: Windows worker contract/);
  assert.match(mobile, /name: Exact source \/ Flutter \/ Android/);
  assert.match(mobile, /name: Exact source \/ Flutter \/ iOS/);
  assert.match(mobile, /name: Exact source \/ PLP native Android/);
  assert.match(mobile, /name: Exact source \/ Euro-Fish native Android/);
  assert.match(governance, /name: Dependency review/);
});

test('root npm manifest changes do not force mobile native validation alone', () => {
  const mobile = read('ci-mobile.yml');
  const detectorStart = mobile.indexOf('  mob_integration_mobile-impact:');
  const androidStart = mobile.indexOf('  mob_integration_verify_android_heavy:', detectorStart);
  assert.ok(detectorStart >= 0 && androidStart > detectorStart,
    'mobile detector section must remain identifiable');
  const detector = mobile.slice(detectorStart, androidStart);
  assert.match(detector, /apps\/pandora-mobile\/\*/);
  assert.doesNotMatch(detector, /package\.json|package-lock\.json/);
});

test('Operations Runtime Seams Flutter checks are scoped to mobile changes or manual invocation', () => {
  const operations = read('ci-operations.yml');
  assert.match(operations, /operations_runtime_seams_mobile_events: \$\{\{ steps\.detect\.outputs\.operations_runtime_seams_mobile_events \}\}/);
  assert.match(operations, /mobile_event_scope = .*apps\/pandora-mobile\/\*\*/);
  const lines = operations.split('\n');
  const start = lines.findIndex((line) => /^  ops_seams_mobile-events:/.test(line));
  const next = lines.findIndex((line, i) => i > start && /^  [A-Za-z0-9_-]+:/.test(line));
  assert.ok(start >= 0 && next > start, 'mobile-events job must exist');
  const job = lines.slice(start, next).join('\n');
  assert.match(job, /needs\.detect_scopes\.outputs\.operations_runtime_seams_mobile_events == 'true'/);
});

test('production deploy remains exact-source, manual, and opt-in', () => {
  const release = read('canonical-release-evidence.yml');
  assert.match(release, /deploy_production:/);
  assert.match(release, /deploy_prebuilt_production:\s*\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.deploy_production == true \}\}/);
  assert.match(release, /SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(release, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
});
