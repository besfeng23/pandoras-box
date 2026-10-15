'use strict';
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = fs.readFileSync('.github/workflows/ci-mobile.yml', 'utf8');
const lines = workflow.split('\n');
function job(id) {
  const start = lines.findIndex((line) => line.startsWith('  ' + id + ':'));
  assert.ok(start >= 0, 'missing job ' + id);
  const next = lines.findIndex((line, index) => index > start && /^  [A-Za-z0-9_-]+:/.test(line));
  return lines.slice(start, next < 0 ? lines.length : next).join('\n');
}
test('required Flutter contexts always report a real result', () => {
  const android = job('mob_integration_verify_android_heavy');
  const ios = job('mob_integration_verify_ios_heavy');
  const androidWrapper = job('mob_integration_verify');
  const iosWrapper = job('mob_integration_verify-ios');
  assert.match(android, /needs\.mob_integration_mobile-impact\.outputs\.mobile == 'true'/);
  assert.match(ios, /needs\.mob_integration_mobile-impact\.outputs\.mobile == 'true'/);
  assert.match(androidWrapper, /if: \$\{\{ always\(\) \}\}/);
  assert.match(androidWrapper, /name: Exact source \/ Flutter \/ Android/);
  assert.match(iosWrapper, /if: \$\{\{ always\(\) \}\}/);
  assert.match(iosWrapper, /name: Exact source \/ Flutter \/ iOS/);
  assert.match(androidWrapper, /needs\.mob_integration_verify_android_heavy\.result/);
  assert.match(iosWrapper, /needs\.mob_integration_verify_ios_heavy\.result/);
});
test('required wrappers bind exact source and fail closed on heavy validation', () => {
  assert.equal((workflow.match(/name: Exact source \/ Flutter \/ Android/g) || []).length, 1);
  assert.equal((workflow.match(/name: Exact source \/ Flutter \/ iOS/g) || []).length, 1);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(workflow, /test "\$HEAVY_RESULT" = "success"/);
  assert.match(workflow, /test "\$HEAVY_RESULT" = "skipped"/);
});
