'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

const workspaces = [
  {
    path: 'packages/pandora-connections-core',
    name: '@pandora/connections-core',
    exports: ['index.mjs', 'connection-manifest.schema.json'],
  },
  {
    path: 'packages/pandora-connections-quality',
    name: '@pandora/connections-quality',
    exports: [
      'src/audit-chain.mjs',
      'src/flow-harness.mjs',
      'src/health-monitor.mjs',
      'src/tenant-isolation.mjs',
      'src/webhook-defense.mjs',
    ],
  },
];

test('connection modules are registered as npm workspaces with lockfile links', () => {
  for (const workspace of workspaces) {
    assert.ok(rootPackage.workspaces.includes(workspace.path), 'missing workspace: ' + workspace.path);
    const manifest = JSON.parse(readFileSync(path.join(root, workspace.path, 'package.json'), 'utf8'));
    assert.equal(manifest.name, workspace.name);
    assert.equal(manifest.type, 'module');
    assert.equal(lock.packages[workspace.path].name, workspace.name);
    assert.equal(lock.packages['node_modules/' + workspace.name].resolved, workspace.path);
    assert.equal(lock.packages['node_modules/' + workspace.name].link, true);
    for (const exportedPath of workspace.exports) {
      assert.ok(existsSync(path.join(root, workspace.path, exportedPath)), 'missing export: ' + workspace.path + '/' + exportedPath);
    }
  }
});
