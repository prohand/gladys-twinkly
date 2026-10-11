import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTIFY_MS, REDISCOVERY_MIN_MS } from '../src/twinkly/service.js';
import { FEATURES, idsOf } from '../src/devices/twinkly.js';
import { makeDevice } from './helpers/fakeTwinkly.js';
import { gladysDevice, setup } from './helpers/setup.js';

async function ready(options) {
  const ctx = setup(options);
  await ctx.service.discover();
  const [entry] = ctx.registry.all();
  const ids = entry ? idsOf(ctx.gladys, entry) : null;
  const feature = (key) => ({ external_id: ids.feature(key) });
  return { ...ctx, entry, ids, feature, device: Object.values(ctx.devices)[0] };
}

test('discovery finds the configured hosts and publishes them', async () => {
  const { service, gladys, entry } = await ready();
  assert.equal(entry.host, '192.168.1.40');
  assert.equal(entry.hasColor, true);
  assert.equal(entry.movies.length, 2);
  assert.equal(entry.effectCount, 5);
  await service.publishDevices();
  assert.equal(gladys.discovered[0].length, 1);
  await service.publishTransports();
  assert.deepEqual(gladys.transports, [
    { external_id: entry && idsOf(gladys, entry).device, transport: 'local' },
  ]);
  await service.publishConnectionStatus();
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
});

test('the network scan adds the devices that answered it', async () => {
  const tree = makeDevice();
  const { service, registry } = setup({
    devices: { '192.168.1.40': makeDevice(), '192.168.1.41': tree },
    config: { hosts: '192.168.1.40' },
    scan: async () => ({ hosts: [{ host: '192.168.1.41', name: 'Tree' }], error: null }),
  });
  const result = await service.discover({ scan: true });
  assert.equal(result.found.length, 2);
  assert.ok(registry.findByHost('192.168.1.41'));
});

test('a device created in Gladys is found again from its saved IP', async () => {
  const twinkly = makeDevice();
  const { service, gladys } = setup({
    devices: { '192.168.1.50': twinkly },
    config: { hosts: '' },
    gladys: {
      devices: [
        {
          external_id: `twinkly:${twinkly.gestalt.mac.replace(/:/g, '')}`,
          params: [{ name: 'IP_ADDRESS', value: '192.168.1.50' }],
        },
      ],
    },
  });
  await service.poll(gladys.devices[0]);
  assert.equal(service.registry.all().length, 1);
  assert.ok(gladys.published.length > 0);
});

test('nothing found: the status says what to do', async () => {
  const { service, gladys } = setup({ devices: {}, config: { hosts: '' } });
  await service.discover();
  await service.publishConnectionStatus();
  assert.equal(gladys.connectionStatuses[0].connected, false);
  assert.match(gladys.connectionStatuses[0].message.fr, /adresse IP/);
});

test('poll publishes the state', async () => {
  const { service, gladys, entry, ids } = await ready();
  await service.poll(gladysDevice(service, entry));
  assert.deepEqual(gladys.statesOf(ids.feature(FEATURES.ON_OFF)), [1]);
  assert.deepEqual(gladys.statesOf(ids.feature(FEATURES.BRIGHTNESS)), [80]);
  assert.deepEqual(gladys.statesOf(ids.feature(FEATURES.COLOR)), [0xff0000]);
  assert.deepEqual(gladys.statesOf(ids.feature(FEATURES.SCENE)), ['movie:aaa-111']);
  // The first read is a baseline, not a change.
  assert.equal(gladys.sceneEvents.length, 0);
});

test('a mode changed from the app fires mode_changed, once', async () => {
  const { service, gladys, entry, device } = await ready();
  const gDevice = gladysDevice(service, entry);
  await service.poll(gDevice);
  device.mode = 'effect';
  await service.poll(gDevice);
  await service.poll(gDevice);
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: 'mode_changed',
      data: {
        device: idsOf(gladys, entry).device,
        device_name: entry.name,
        mode: 'effect',
        previous_mode: 'movie',
      },
    },
  ]);
});

test('a mode changed by Gladys never fires mode_changed', async () => {
  const { service, gladys, entry, feature } = await ready();
  const gDevice = gladysDevice(service, entry);
  await service.poll(gDevice);
  await service.setValue(gDevice, feature(FEATURES.ON_OFF), 0);
  await service.poll(gDevice);
  assert.equal(gladys.sceneEvents.length, 0);
});

test('a poll racing a Gladys order is dropped', async () => {
  const { service, gladys, entry, feature } = await ready();
  const gDevice = gladysDevice(service, entry);
  await service.poll(gDevice);
  await Promise.all([
    service.poll(gDevice),
    service.setValue(gDevice, feature(FEATURES.ON_OFF), 0),
  ]);
  assert.equal(gladys.sceneEvents.length, 0);
});

test('unplugged then back: offline and online, one each, with the badge', async () => {
  const { service, gladys, entry, device } = await ready();
  const gDevice = gladysDevice(service, entry);
  await service.poll(gDevice);
  device.reachable = false;
  await service.poll(gDevice);
  await service.poll(gDevice);
  assert.deepEqual(
    gladys.sceneEvents.map((e) => e.key),
    ['device_offline'],
  );
  assert.equal(gladys.transports.at(-1).transport, 'unreachable');
  assert.equal(gladys.connectionStatuses.at(-1).connected, false);
  device.reachable = true;
  await service.poll(gDevice);
  assert.deepEqual(
    gladys.sceneEvents.map((e) => e.key),
    ['device_offline', 'device_online'],
  );
  assert.equal(gladys.transports.at(-1).transport, 'local');
});

test('on/off: off is mode off, on restores what it played last', async () => {
  const { service, entry, feature, device } = await ready();
  const gDevice = gladysDevice(service, entry);
  device.mode = 'effect';
  await service.poll(gDevice);
  await service.setValue(gDevice, feature(FEATURES.ON_OFF), 0);
  assert.equal(device.mode, 'off');
  await service.setValue(gDevice, feature(FEATURES.ON_OFF), 1);
  assert.equal(device.mode, 'effect');
});

test('on follows the configured mode, and falls back when refused', async () => {
  const { service, entry, feature, device } = await ready({
    devices: { '192.168.1.40': makeDevice({ mode: 'off', refusedModes: ['playlist'] }) },
    config: { turn_on_mode: 'playlist' },
  });
  await service.setValue(gladysDevice(service, entry), feature(FEATURES.ON_OFF), 1);
  assert.equal(device.mode, 'effect');
});

test('on with nothing remembered plays the movie, or an effect without movies', async () => {
  const { service, entry, feature, device } = await ready({
    devices: { '192.168.1.40': makeDevice({ mode: 'off', movies: [] }) },
  });
  await service.setValue(gladysDevice(service, entry), feature(FEATURES.ON_OFF), 1);
  assert.equal(device.mode, 'effect');
});

test('brightness raised on a light that is off turns it on', async () => {
  const { service, entry, feature, device } = await ready({
    devices: { '192.168.1.40': makeDevice({ mode: 'off' }) },
  });
  const gDevice = gladysDevice(service, entry);
  await service.poll(gDevice);
  await service.setValue(gDevice, feature(FEATURES.BRIGHTNESS), 35);
  assert.equal(device.brightness, 35);
  assert.equal(device.mode, 'movie');
});

test('color sets the solid color mode', async () => {
  const { service, gladys, entry, feature, device, ids } = await ready();
  await service.setValue(gladysDevice(service, entry), feature(FEATURES.COLOR), 0x00ff80);
  assert.deepEqual(device.color, { red: 0, green: 255, blue: 128 });
  assert.equal(device.mode, 'color');
  assert.deepEqual(gladys.statesOf(ids.feature(FEATURES.COLOR)), [0x00ff80]);
});

test('scene select plays a movie, an effect or the playlist', async () => {
  const { service, entry, feature, device } = await ready();
  const gDevice = gladysDevice(service, entry);
  await service.setValue(gDevice, feature(FEATURES.SCENE), 'movie:bbb-222');
  assert.equal(device.currentMovie, 1);
  assert.equal(device.mode, 'movie');
  await service.setValue(gDevice, feature(FEATURES.SCENE), 'effect:3');
  assert.equal(device.currentEffect, 3);
  assert.equal(device.mode, 'effect');
  await service.setValue(gDevice, feature(FEATURES.SCENE), 'playlist');
  assert.equal(device.mode, 'playlist');
  await assert.rejects(
    service.setValue(gDevice, feature(FEATURES.SCENE), 'movie:nope'),
    /Unknown scene/,
  );
});

test('an order to an unknown device fails', async () => {
  const { service } = await ready();
  service.lastDiscoveryAt = Date.now();
  await assert.rejects(
    service.setValue({ external_id: 'twinkly:000000000000' }, { external_id: 'x' }, 1),
    /not found/,
  );
});

test('playMovie finds a movie by name, by position, or after a new upload', async () => {
  const { service, entry, device } = await ready();
  const id = idsOf(service.gladys, entry).device;
  assert.equal((await service.playMovie(id, ' fireworks ')).name, 'Fireworks');
  assert.equal(device.currentMovie, 1);
  assert.equal((await service.playMovie(id, '1')).name, 'Snowfall');
  device.movies.push({ id: 2, name: 'Hearts', unique_id: 'ccc' });
  assert.equal((await service.playMovie(id, 'Hearts')).name, 'Hearts');
  await assert.rejects(
    service.playMovie(id, 'Nope'),
    /No movie "Nope".*Snowfall, Fireworks, Hearts/,
  );
});

test('playEffect is numbered from 1 and checks the range', async () => {
  const { service, entry, device } = await ready();
  const id = idsOf(service.gladys, entry).device;
  assert.equal(await service.playEffect(id, 2), 2);
  assert.equal(device.currentEffect, 1);
  assert.equal(device.mode, 'effect');
  await assert.rejects(service.playEffect(id, 9), /1 to 5/);
  await assert.rejects(service.playEffect(id, 0), /does not exist/);
});

test('applyMode switches the mode; "on" says which one it chose', async () => {
  const { service, entry, device } = await ready();
  const id = idsOf(service.gladys, entry).device;
  assert.equal(await service.applyMode(id, 'off'), 'off');
  assert.equal(device.mode, 'off');
  assert.equal(await service.applyMode(id, 'on'), 'movie');
  assert.equal(await service.applyMode(id, 'demo'), 'demo');
  await assert.rejects(service.applyMode(id, 'disco'), /Unknown mode/);
  entry.hasColor = false;
  await assert.rejects(service.applyMode(id, 'color'), /no solid color/);
});

test('switchAll turns every Twinkly on or off and counts the failures', async () => {
  const a = makeDevice();
  const b = makeDevice();
  const { service } = await ready({ devices: { '192.168.1.40': a, '192.168.1.41': b } });
  assert.deepEqual(await service.switchAll(false), { done: 2, failed: 0 });
  assert.equal(a.mode, 'off');
  assert.equal(b.mode, 'off');
  b.reachable = false;
  assert.deepEqual(await service.switchAll(true), { done: 1, failed: 1 });
  assert.equal(a.mode, 'movie');
});

test('identify plays the demo, then restores the mode', async () => {
  const { service, entry, device, waits } = await ready({
    devices: { '192.168.1.40': makeDevice({ mode: 'off' }) },
  });
  const message = await service.identify(idsOf(service.gladys, entry).device);
  assert.deepEqual(waits, [IDENTIFY_MS]);
  assert.ok(device.calls.some((c) => c.path === '/led/mode' && c.body?.mode === 'demo'));
  assert.equal(device.mode, 'off');
  assert.match(message.fr, /démo/);
});

test('identify on an unknown device says so', async () => {
  const { service } = await ready();
  service.lastDiscoveryAt = Date.now();
  const message = await service.identify('twinkly:000000000000');
  assert.match(message.en, /does not answer/);
});

test('a lost device triggers a rediscovery, not more than every five minutes', async () => {
  const twinkly = makeDevice();
  let scans = 0;
  const { service, clock } = setup({
    devices: { '192.168.1.77': twinkly },
    config: { hosts: '', auto_discovery: true },
    scan: async () => {
      scans += 1;
      return { hosts: [{ host: '192.168.1.77', name: 'x' }], error: null };
    },
  });
  const externalId = `twinkly:${twinkly.gestalt.mac.replace(/:/g, '')}`;
  service.lastDiscoveryAt = clock.now - REDISCOVERY_MIN_MS;
  assert.ok(await service.ensureEntry(externalId));
  assert.equal(scans, 1);
  assert.equal(await service.ensureEntry('twinkly:000000000000'), null);
  assert.equal(scans, 1);
});

test('test the connection: a report in both languages', async () => {
  const { service, gladys } = setup({
    devices: { '192.168.1.40': makeDevice() },
    config: { hosts: '192.168.1.40, 192.168.1.99', auto_discovery: true },
    scan: async () => ({ hosts: [], error: 'HTTP 403' }),
  });
  const report = await service.testConnection();
  assert.match(report.en, /Network scan unavailable \(HTTP 403\)/);
  assert.match(report.en, /192\.168\.1\.40, 250 LEDs fw 2\.8\.3\): Movie\./);
  assert.match(report.fr, /192\.168\.1\.99 : pas de réponse\./);
  assert.equal(gladys.discovered.length, 1);
});
