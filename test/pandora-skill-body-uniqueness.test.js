'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function listSkillEntrypoints(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listSkillEntrypoints(full));
    else if (entry.isFile() && entry.name === 'SKILL.md') {
      found.push({ path: path.relative(root, full).split(path.sep).join('/'), content: fs.readFileSync(full, 'utf8') });
    }
  }
  return found;
}

function digest(content) {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n').trim()).digest('hex');
}

test('the two skill trees do not store byte-identical full SKILL.md bodies twice', () => {
  const agentSkills = listSkillEntrypoints(path.join(root, '.agents/skills'));
  const claudeSkills = listSkillEntrypoints(path.join(root, '.claude/skills'));
  assert.ok(agentSkills.length > 0, 'governed .agents skills must exist');
  assert.ok(claudeSkills.length > 0, 'Claude skill entrypoints must exist');

  const byDigest = new Map();
  for (const item of [...agentSkills, ...claudeSkills]) {
    const key = digest(item.content);
    const existing = byDigest.get(key) || [];
    existing.push(item.path);
    byDigest.set(key, existing);
  }
  const duplicatesAcrossTrees = [...byDigest.values()].filter((paths) =>
    paths.some((p) => p.startsWith('.agents/skills/')) &&
    paths.some((p) => p.startsWith('.claude/skills/')),
  );
  assert.deepEqual(duplicatesAcrossTrees, [], 'duplicate full skill bodies should have one on-disk source');
});
