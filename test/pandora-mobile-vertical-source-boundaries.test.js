'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const mobile = path.join(root, 'apps/pandora-mobile');
const corePaths = [
  'lib/core/local_ai/plp_chat_fallback.dart',
  'lib/core/data/plp_paypal_billing_api.dart',
  'lib/core/data/eurofish_workspace_api.dart',
];
const featurePaths = [
  'lib/features/enterprise/plp/local_ai/plp_chat_fallback.dart',
  'lib/features/enterprise/plp/data/plp_paypal_billing_api.dart',
  'lib/features/enterprise/eurofish/data/eurofish_workspace_api.dart',
];

test('vertical-specific PLP and Euro-Fish adapters live outside the mobile core', () => {
  for (const relative of corePaths) assert.equal(fs.existsSync(path.join(mobile, relative)), false, 'vertical implementation left in core: ' + relative);
  for (const relative of featurePaths) assert.equal(fs.existsSync(path.join(mobile, relative)), true, 'missing vertical feature source: ' + relative);
});

test('mobile consumers import the domain-owned adapters', () => {
  const ask = fs.readFileSync(path.join(mobile, 'lib/features/simple/ask_pandora_screen.dart'), 'utf8');
  const plp = fs.readFileSync(path.join(mobile, 'lib/app/plp_enterprise_shell.dart'), 'utf8');
  const billing = fs.readFileSync(path.join(mobile, 'lib/features/enterprise/plp_paypal_billing_screen.dart'), 'utf8');
  const eurofish = fs.readFileSync(path.join(mobile, 'lib/app/eurofish_enterprise_shell.dart'), 'utf8');
  assert.ok(ask.includes('../enterprise/plp/local_ai/plp_chat_fallback.dart'));
  assert.ok(plp.includes('../features/enterprise/plp/data/plp_paypal_billing_api.dart'));
  assert.ok(billing.includes('plp/data/plp_paypal_billing_api.dart'));
  assert.ok(eurofish.includes('../features/enterprise/eurofish/data/eurofish_workspace_api.dart'));
});

