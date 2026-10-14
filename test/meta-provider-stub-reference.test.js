'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('the Meta MCP public index no longer imports the empty provider stub', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../apps/meta-business-mcp/src/index.js'), 'utf8');
  assert.doesNotMatch(source, /__exportStar\(require\(["']\.\/meta\/provider["']\), exports\);/);
});

