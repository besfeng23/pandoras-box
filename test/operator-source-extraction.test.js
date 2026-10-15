'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonical = path.join(root, 'src/operator');
const legacy = path.join(root, 'apps/meta-business-mcp/src/operator');

test('operator runtime has a canonical home outside the Meta MCP app', () => {
  for (const file of ['api.js', 'library-index.js', 'preview-focus.js', 'project-change.js', 'vercel-connect-user.js']) {
    assert.ok(fs.existsSync(path.join(canonical, file)), 'missing canonical operator module: ' + file);
    const wrapper = fs.readFileSync(path.join(legacy, file), 'utf8');
    assert.ok(wrapper.includes("path.resolve(__dirname, '../../../../src/operator/" + file + "')"), 'legacy wrapper does not resolve the canonical module: ' + file);
    assert.ok(!wrapper.includes('require("../../../../src/operator/'), 'legacy wrapper must keep the cross-root dependency dynamic: ' + file);
  }
  assert.ok(fs.existsSync(path.join(root, 'src/supabase/rest-client.js')));
  assert.ok(fs.readFileSync(path.join(root, 'apps/meta-business-mcp/src/supabase/rest-client.js'), 'utf8')
    .includes("path.resolve(__dirname, '../../../../src/supabase/rest-client.js')"));
});

test('the Vercel operator route imports the canonical implementation', () => {
  const route = fs.readFileSync(path.join(root, 'api/operator.ts'), 'utf8');
  assert.ok(route.includes("import { createOperatorApiApp } from '../src/operator/api.js';"));
  assert.ok(!route.includes('../apps/meta-business-mcp/src/operator/api.js'));
});

