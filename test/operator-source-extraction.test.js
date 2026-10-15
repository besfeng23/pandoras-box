'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonical = path.join(root, 'src/operator');
const legacy = path.join(root, 'apps/meta-business-mcp/src/operator');
const operatorFiles = ['api.js', 'library-index.js', 'preview-focus.js', 'project-change.js', 'vercel-connect-user.js'];
const appTestPaths = [
  'apps/meta-business-mcp/test/operator-connect.test.js',
  'apps/meta-business-mcp/test/operator-preview-focus.test.js',
  'apps/meta-business-mcp/test/operator-project-change.test.js',
  'apps/meta-business-mcp/test/operator-status.test.js',
  'apps/meta-business-mcp/test/vercel-connect-user.test.js',
  'apps/meta-business-mcp/test/operator-approval.test.js',
];

test('operator runtime has only one implementation home', () => {
  for (const file of operatorFiles) {
    assert.ok(fs.existsSync(path.join(canonical, file)), 'missing canonical operator module: ' + file);
    assert.ok(!fs.existsSync(path.join(legacy, file)), 'redundant operator wrapper remains: ' + file);
  }
  assert.ok(fs.existsSync(path.join(root, 'src/supabase/rest-client.js')));
  assert.ok(fs.readFileSync(path.join(root, 'apps/meta-business-mcp/src/supabase/rest-client.js'), 'utf8')
    .includes("path.resolve(__dirname, '../../../../src/supabase/rest-client.js')"));
});

test('Meta MCP operator tests import canonical sources, not app-local wrapper outputs', () => {
  for (const relativePath of appTestPaths) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.ok(source.includes('../../../src/operator/'), relativePath + ' does not import canonical operator modules');
    assert.ok(!source.includes('../dist/operator/'), relativePath + ' still imports compiled compatibility wrappers');
  }
});

test('the Vercel operator route imports the canonical implementation', () => {
  const route = fs.readFileSync(path.join(root, 'api/operator.ts'), 'utf8');
  assert.ok(route.includes("import { createOperatorApiApp } from '../src/operator/api.js';"));
  assert.ok(!route.includes('../apps/meta-business-mcp/src/operator/api.js'));
});
