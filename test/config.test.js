import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  GLADYS_POLL_FREQUENCIES_MS,
  gladysPollFrequency,
  normalizeConfig,
  parseHosts,
} from '../src/config.js';

test('normalizeConfig fills the defaults', () => {
  const config = normalizeConfig();
  assert.equal(config.auto_discovery, true);
  assert.equal(config.refreshSeconds, 30);
  assert.equal(config.turn_on_mode, 'last');
  assert.deepEqual(config.hostList, []);
  assert.equal(config.hosts, DEFAULT_CONFIG.hosts);
});

test('normalizeConfig reads strings a form may send', () => {
  const config = normalizeConfig({
    auto_discovery: 'false',
    refresh_interval: '60',
    turn_on_mode: 'nonsense',
  });
  assert.equal(config.auto_discovery, false);
  assert.equal(config.refreshSeconds, 60);
  assert.equal(config.turn_on_mode, 'last');
});

test('parseHosts accepts commas, spaces, new lines and URLs', () => {
  assert.deepEqual(parseHosts('192.168.1.40, 192.168.1.41;192.168.1.40\nhttp://twinkly.lan/'), [
    '192.168.1.40',
    '192.168.1.41',
    'twinkly.lan',
  ]);
  assert.deepEqual(parseHosts(undefined), []);
  assert.deepEqual(parseHosts('host!'), []);
});

test('gladysPollFrequency always gives a tick Gladys accepts', () => {
  for (const seconds of [1, 5, 10, 15, 30, 45, 60, 600]) {
    assert.ok(GLADYS_POLL_FREQUENCIES_MS.includes(gladysPollFrequency(seconds)));
  }
  assert.equal(gladysPollFrequency(30), 30000);
  assert.equal(gladysPollFrequency(45), 30000);
  assert.equal(gladysPollFrequency(600), 60000);
  assert.equal(gladysPollFrequency(0), 1000);
});
