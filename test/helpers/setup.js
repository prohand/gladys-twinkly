// -----------------------------------------------------------------------------
// A TwinklyService wired to a fake Gladys and fake Twinkly devices.
// -----------------------------------------------------------------------------

import { TwinklyClient } from '../../src/twinkly/client.js';
import { TwinklyRegistry } from '../../src/twinkly/registry.js';
import { TwinklyService } from '../../src/twinkly/service.js';
import { createFakeGladys } from './fakeGladys.js';
import { createFakeTwinkly, makeDevice } from './fakeTwinkly.js';

/**
 * @param {object} [options]
 * @param {Record<string, object>} [options.devices] host -> fake device
 * @param {object} [options.config] raw configuration (hosts default to the devices)
 * @param {object} [options.gladys] options of createFakeGladys
 * @param {Function} [options.scan] network discovery stand-in
 */
export function setup({ devices, config = {}, gladys: gladysOptions = {}, scan } = {}) {
  const hosts = devices ?? { '192.168.1.40': makeDevice() };
  const twinkly = createFakeTwinkly(hosts);
  const gladys = createFakeGladys(gladysOptions);
  const clock = { now: 1_000_000 };
  const registry = new TwinklyRegistry({
    createClient: (host) => new TwinklyClient(host, { fetch: twinkly.fetch, now: () => clock.now }),
  });
  const waits = [];
  const service = new TwinklyService({
    gladys,
    registry,
    scan: scan ?? (async () => ({ hosts: [], error: null })),
    now: () => clock.now,
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  service.setConfig({ hosts: Object.keys(hosts).join(', '), auto_discovery: false, ...config });
  return { service, gladys, twinkly, registry, clock, waits, devices: hosts };
}

/** The Gladys device of an entry, as Gladys hands it to onPoll/onSetValue. */
export function gladysDevice(service, entry) {
  return service.buildDevices().find((d) => d.name === entry.name);
}
