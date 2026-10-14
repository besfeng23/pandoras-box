'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, '.agents/skills/unified-registry.json'), 'utf8'));
const nativeIndex = JSON.parse(fs.readFileSync(path.join(root, '.agents/skills/registry.json'), 'utf8'));

test('unified registry covers every registered foundation and domain skill once', () => {
  const foundation = catalog.skills.filter((skill) => skill.source_system === 'agents');
  const domains = catalog.skills.filter((skill) => skill.source_system === 'claude');
  assert.equal(nativeIndex.skill_count, 51);
  assert.equal(foundation.length, 51);
  assert.equal(domains.length, 33);
  assert.equal(catalog.skills.length, 84);
  assert.equal(new Set(catalog.skills.map((skill) => skill.id)).size, 84);
  assert.deepEqual(catalog.source_sets.map((source) => [source.source_system, source.skill_count]), [['agents', 51], ['claude', 33]]);
  for (const skill of catalog.skills) {
    assert.ok(fs.existsSync(path.join(root, skill.entrypoint)), 'missing skill entrypoint: ' + skill.entrypoint);
    assert.ok(skill.id.length > 0);
  }
});

test('unified foundation entries match the six native registry shards', () => {
  const ids = nativeIndex.shards.flatMap((shardPath) => {
    const shard = JSON.parse(fs.readFileSync(path.join(root, shardPath), 'utf8'));
    return shard.skills.map((skill) => skill.id);
  }).sort();
  const unified = catalog.skills.filter((skill) => skill.source_system === 'agents').map((skill) => skill.id).sort();
  assert.deepEqual(unified, ids);
});

test('domain entrypoints match the native Claude skill directories', () => {
  const nativeIds = fs.readdirSync(path.join(root, '.claude/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, '.claude/skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name).sort();
  const unified = catalog.skills.filter((skill) => skill.source_system === 'claude').map((skill) => skill.id).sort();
  assert.deepEqual(unified, nativeIds);
});

