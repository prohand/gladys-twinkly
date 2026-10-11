// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, TURN_ON_MODES } from '../src/config.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, SET_MODE_VALUES } from '../src/capabilities/scenes.js';
import { BUTTON_SETS, WIDGETS } from '../src/capabilities/widget.js';
import { MODE_LABELS } from '../src/twinkly/labels.js';
import { DISCOVERY_PORT } from '../src/twinkly/discovery.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Every text object of the manifest, with where it is.
function texts(node, path = 'manifest', found = []) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => texts(child, `${path}[${i}]`, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (['label', 'description', 'placeholder'].includes(key)) {
        found.push({ path: `${path}.${key}`, value });
      } else {
        texts(value, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('every manifest action is registered in index.js', () => {
  for (const action of manifest.actions) {
    assert.match(indexSource, new RegExp(`onAction\\('${action.key}'`), action.key);
  }
});

test('scene triggers, scene actions and widgets need Gladys >= 5.1.0', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('the mode filter of mode_changed knows every LED mode', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGERS.MODE_CHANGED);
  const options = trigger.fields.find((f) => f.key === 'mode').options.map((o) => o.value);
  assert.deepEqual(options.sort(), Object.keys(MODE_LABELS).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('the set_mode options are the modes the code accepts', () => {
  const action = manifest.scene_actions.find((a) => a.key === 'set_mode');
  const options = action.fields.find((f) => f.key === 'mode').options.map((o) => o.value);
  assert.deepEqual(options, SET_MODE_VALUES);
});

test('every widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('the widget button sets are the ones the code builds', () => {
  const widget = manifest.widgets.find((w) => w.key === 'twinkly_overview');
  const field = widget.settings.find((f) => f.key === 'buttons');
  assert.deepEqual(
    field.options.map((o) => o.value),
    Object.values(BUTTON_SETS),
  );
  assert.equal(field.default, BUTTON_SETS.SCENES);
});

test('config_schema defaults stay equal to DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(stored).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
  }
  const turnOn = stored.find((f) => f.key === 'turn_on_mode').options.map((o) => o.value);
  assert.deepEqual(turnOn, Object.values(TURN_ON_MODES));
});

test('the refresh interval only offers values Gladys can poll at', () => {
  const field = manifest.config_schema.find((f) => f.key === 'refresh_interval');
  for (const option of field.options) {
    assert.ok([10, 15, 30, 60].includes(Number(option.value)), option.value);
  }
});

test('the network discovery declares the Twinkly port', () => {
  assert.deepEqual(manifest.network_discovery, [
    { type: 'udp-active-broadcast', ports: [DISCOVERY_PORT] },
  ]);
});

test('Twinkly is driven locally only: no cloud transport', () => {
  assert.deepEqual(manifest.transports, ['local']);
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('every text is bilingual, English and French', () => {
  for (const { path, value } of texts(manifest)) {
    assert.equal(typeof value, 'object', `${path} must be a { en, fr } object`);
    assert.ok(value.en, `${path}.en`);
    assert.ok(value.fr, `${path}.fr`);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`), manifest.docker_image);
});
