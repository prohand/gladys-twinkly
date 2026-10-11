import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TwinklyClient, TwinklyError, intToRgb, rgbToInt } from '../src/twinkly/client.js';
import { createFakeTwinkly, makeDevice } from './helpers/fakeTwinkly.js';

function clientFor(device, { now = () => 0 } = {}) {
  const { fetch } = createFakeTwinkly({ '10.0.0.5': device });
  return new TwinklyClient('10.0.0.5', { fetch, now });
}

test('logs in once, then reuses the token', async () => {
  const device = makeDevice();
  const client = clientFor(device);
  assert.equal(await client.getMode(), 'movie');
  assert.equal(await client.getBrightness(), 80);
  assert.equal(device.logins, 1);
  const verify = device.calls.find((c) => c.path === '/verify');
  assert.deepEqual(verify.body, { 'challenge-response': 'answer' });
});

test('logs in again when the token expires', async () => {
  const device = makeDevice();
  let clock = 0;
  const client = clientFor(device, { now: () => clock });
  await client.getMode();
  clock = 4 * 3600 * 1000;
  await client.getMode();
  assert.equal(device.logins, 2);
});

test('a 401 (token taken by the app) logs in again and retries once', async () => {
  const device = makeDevice();
  const client = clientFor(device);
  await client.getMode();
  device.token = null;
  assert.equal(await client.getMode(), 'movie');
  assert.equal(device.logins, 2);
});

test('an API code other than 1000 is an error', async () => {
  const device = makeDevice({ refusedModes: ['playlist'] });
  const client = clientFor(device);
  await assert.rejects(client.setMode('playlist'), (err) => {
    assert.ok(err instanceof TwinklyError);
    assert.equal(err.reason, 'api');
    assert.equal(err.code, 1104);
    return true;
  });
  // The queue survives the failure.
  assert.equal(await client.getMode(), 'movie');
});

test('an unplugged device is reported unreachable', async () => {
  const device = makeDevice({ reachable: false });
  const client = clientFor(device);
  await assert.rejects(client.gestalt(), (err) => err.reason === 'unreachable');
});

test('a device that never answers times out', async () => {
  const fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  const client = new TwinklyClient('10.0.0.6', { fetch, timeoutMs: 10 });
  await assert.rejects(client.gestalt(), (err) => err.reason === 'timeout');
});

test('requests to one device never overlap', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const device = makeDevice();
  const fake = createFakeTwinkly({ '10.0.0.7': device });
  const fetch = async (url, init) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    try {
      return await fake.fetch(url, init);
    } finally {
      inFlight -= 1;
    }
  };
  const client = new TwinklyClient('10.0.0.7', { fetch });
  await Promise.all([client.getMode(), client.getBrightness(), client.getColor()]);
  assert.equal(maxInFlight, 1);
});

test('brightness is clamped, a disabled dimmer reads 100 %', async () => {
  const device = makeDevice();
  const client = clientFor(device);
  await client.setBrightness(140);
  assert.equal(device.brightness, 100);
  const raw = new TwinklyClient('h', {
    fetch: async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ mode: 'disabled', value: 10, code: 1000 }),
    }),
  });
  raw.token = 't';
  raw.tokenExpiresAt = Infinity;
  assert.equal(await raw.getBrightness(), 100);
});

test('colors convert between RGB and the Gladys integer', () => {
  assert.equal(rgbToInt({ red: 255, green: 0, blue: 0 }), 0xff0000);
  assert.equal(rgbToInt({ red: 300, green: -4, blue: 16 }), 0xff0010);
  assert.deepEqual(intToRgb(0x12ab34), { red: 0x12, green: 0xab, blue: 0x34 });
  assert.deepEqual(intToRgb(rgbToInt({ red: 1, green: 2, blue: 3 })), {
    red: 1,
    green: 2,
    blue: 3,
  });
});
