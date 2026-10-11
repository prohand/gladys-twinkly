import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  FEATURES,
  buildDevice,
  idsOf,
  parseScene,
  sceneOptions,
  statesOf,
} from '../src/devices/twinkly.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function entry(overrides = {}) {
  return {
    platformId: '98f4ab33aaff',
    name: 'Tree',
    host: '192.168.1.40',
    gestalt: { mac: '98:f4:ab:33:aa:ff' },
    productCode: 'TWS250STP-B',
    firmware: '2.8.3',
    ledCount: 250,
    hasColor: true,
    movies: [
      { id: 0, name: 'Snowfall', unique_id: 'aaa' },
      { id: 1, name: 'Fireworks', unique_id: 'bbb' },
    ],
    effectCount: 2,
    playlist: [{ id: 0 }],
    ...overrides,
  };
}

test('a Twinkly is a light with on/off, brightness, color and scene', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, entry(), normalizeConfig({ refresh_interval: '15' }));
  assert.equal(device.external_id, 'twinkly:98f4ab33aaff');
  assert.equal(device.should_poll, true);
  assert.equal(device.poll_frequency, 15000);
  assert.deepEqual(
    device.features.map((f) => `${f.category}/${f.type}`),
    ['light/binary', 'light/brightness', 'light/color', 'text/select'],
  );
  for (const feature of device.features) {
    // NOT NULL in Gladys.
    assert.equal(typeof feature.min, 'number', feature.name);
    assert.equal(typeof feature.max, 'number', feature.name);
  }
  assert.deepEqual(
    device.params.find((p) => p.name === 'IP_ADDRESS'),
    { name: 'IP_ADDRESS', value: '192.168.1.40' },
  );
});

test('no color feature on an old firmware, no scene without anything to play', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(
    gladys,
    entry({ hasColor: false, movies: [], effectCount: 0, playlist: [] }),
    normalizeConfig(),
  );
  assert.deepEqual(
    device.features.map((f) => f.type),
    ['binary', 'brightness'],
  );
});

test('scene options list the movies, the playlist and the effects with stable values', () => {
  assert.deepEqual(
    sceneOptions(entry()).map((o) => [o.value, o.label, o.sort_order]),
    [
      ['movie:aaa', 'Snowfall', 0],
      ['movie:bbb', 'Fireworks', 1],
      ['playlist', 'Playlist', 2],
      ['effect:0', 'Effect 1', 3],
      ['effect:1', 'Effect 2', 4],
    ],
  );
});

test('a scene value reads back', () => {
  const e = entry();
  assert.equal(parseScene(e, 'movie:bbb').movie.name, 'Fireworks');
  assert.equal(parseScene(e, 'movie:1').movie.name, 'Fireworks');
  assert.deepEqual(parseScene(e, 'effect:1'), { kind: 'effect', id: 1 });
  assert.deepEqual(parseScene(e, 'playlist'), { kind: 'playlist' });
  assert.equal(parseScene(e, 'movie:zzz'), null);
  assert.equal(parseScene(e, 'effect:x'), null);
  assert.equal(parseScene(e, 'nonsense'), null);
});

test('states map the mode to on/off and skip what the device lacks', () => {
  const gladys = createFakeGladys();
  const e = entry();
  const ids = idsOf(gladys, e);
  assert.deepEqual(statesOf(gladys, e, { mode: 'off', brightness: 40, color: 255, scene: null }), [
    { device_feature_external_id: ids.feature(FEATURES.ON_OFF), state: 0 },
    { device_feature_external_id: ids.feature(FEATURES.BRIGHTNESS), state: 40 },
    { device_feature_external_id: ids.feature(FEATURES.COLOR), state: 255 },
  ]);
  const playing = statesOf(gladys, e, {
    mode: 'movie',
    brightness: 40,
    color: 0,
    scene: 'movie:aaa',
  });
  assert.deepEqual(playing[0].state, 1);
  assert.deepEqual(playing[3], {
    device_feature_external_id: ids.feature(FEATURES.SCENE),
    text: 'movie:aaa',
  });
});
