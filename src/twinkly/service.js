// -----------------------------------------------------------------------------
// The integration itself: finds the Twinkly devices, reads them, drives them.
//
// index.js only wires the SDK to the methods below, so the whole behaviour can
// be tested with a fake Gladys and a fake Twinkly (test/helpers/).
//
// Where the devices come from, merged:
//   1. the `hosts` typed in the configuration (always works);
//   2. the IP_ADDRESS param of the devices already created in Gladys (so a
//      restart needs no scan);
//   3. the mediated UDP discovery (see discovery.js), when enabled.
// A created device whose IP no longer answers (new DHCP lease) triggers a new
// discovery, at most once every REDISCOVERY_MIN_MS.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { normalizeConfig, TURN_ON_MODES } from '../config.js';
import { LED_MODES, TwinklyError, intToRgb } from './client.js';
import { scanForTwinkly } from './discovery.js';
import { TwinklyRegistry } from './registry.js';
import { joinTexts, modeLabel } from './labels.js';
import {
  FEATURES,
  buildDevice,
  idsOf,
  parseScene,
  readState,
  sceneOptions,
  statesOf,
} from '../devices/twinkly.js';
import { SCENE_TRIGGERS, SET_MODE_VALUES, fireTrigger } from '../capabilities/scenes.js';

/** An unchanged value is still re-sent this often, so Gladys never shows it as stale. */
export const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const logger = createLogger({ name: 'twinkly' });

/** Never re-run a discovery for a lost device more often than this. */
export const REDISCOVERY_MIN_MS = 5 * 60 * 1000;

/** Brightness points one widget tap adds or removes, and the floor it stops at. */
export const BRIGHTNESS_STEP = 10;

/** How long "Identify" keeps the demo mode on. */
export const IDENTIFY_MS = 5000;

/** Modes "on" can come back to: the ones that show something chosen. */
const RESTORABLE_MODES = [LED_MODES.MOVIE, LED_MODES.EFFECT, LED_MODES.PLAYLIST, LED_MODES.COLOR];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deviceParam(device, name) {
  return (device?.params ?? []).find((param) => param.name === name)?.value ?? null;
}

/** A failure that says the device is gone, not that it refused something. */
function isConnectivityError(err) {
  return err instanceof TwinklyError && ['unreachable', 'timeout'].includes(err.reason);
}

export class TwinklyService {
  /**
   * @param {object} options
   * @param {object} options.gladys SDK instance (or the test fake)
   * @param {TwinklyRegistry} [options.registry]
   * @param {(gladys: object) => Promise<object>} [options.scan] network discovery
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.wait]
   */
  constructor({
    gladys,
    registry = new TwinklyRegistry(),
    scan = scanForTwinkly,
    now = Date.now,
    wait = sleep,
  }) {
    this.gladys = gladys;
    this.registry = registry;
    this.scan = scan;
    this.now = now;
    this.wait = wait;
    this.config = normalizeConfig();
    this.lastDiscovery = null;
    this.lastDiscoveryAt = 0;
    /** Called when something the widget shows changed (index.js nudges it). */
    this.onChange = () => {};
  }

  setConfig(config) {
    this.config = normalizeConfig(config);
  }

  // --- Discovery ------------------------------------------------------------

  /** Hosts worth probing without a scan. */
  knownHosts() {
    const fromGladys = (this.gladys.devices ?? [])
      .map((device) => deviceParam(device, 'IP_ADDRESS'))
      .filter(Boolean);
    const fromRegistry = this.registry.all().map((entry) => entry.host);
    return [...new Set([...this.config.hostList, ...fromGladys, ...fromRegistry])];
  }

  /**
   * Find the devices: known hosts, plus a network scan when enabled.
   * @param {object} [options]
   * @param {boolean} [options.scan] defaults to the `auto_discovery` setting
   */
  async discover({ scan = this.config.auto_discovery } = {}) {
    let scanned = { hosts: [], error: null };
    if (scan) {
      scanned = await this.scan(this.gladys);
    }
    const hosts = [...new Set([...this.knownHosts(), ...scanned.hosts.map((h) => h.host)])];
    const { found, failed } = await this.registry.probeAll(hosts);
    this.lastDiscoveryAt = this.now();
    this.lastDiscovery = { scanned: scan, scanError: scanned.error, found, failed };
    logger.info(`Discovery: ${found.length} Twinkly found, ${failed.length} host(s) silent`);
    return this.lastDiscovery;
  }

  buildDevices() {
    return this.registry.all().map((entry) => buildDevice(this.gladys, entry, this.config));
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDevices());
  }

  /** The transport badge of every known device. */
  transportEntries() {
    return this.registry.all().map((entry) => ({
      external_id: idsOf(this.gladys, entry).device,
      transport: entry.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
    }));
  }

  async publishTransports() {
    const entries = this.transportEntries();
    if (entries.length > 0) {
      await this.gladys.publishTransports(entries);
    }
  }

  /** Status shown in the Configuration screen. */
  async publishConnectionStatus() {
    const entries = this.registry.all();
    if (entries.length === 0) {
      await this.gladys.setConnectionStatus(false, {
        en: 'No Twinkly found yet: type its IP address in the configuration, or run a scan.',
        fr: 'Aucun Twinkly trouvé : saisissez son adresse IP dans la configuration, ou lancez une recherche.',
        de: 'Noch kein Twinkly gefunden: Gib seine IP-Adresse in der Konfiguration ein oder starte eine Suche.',
        es: 'Todavía no se ha encontrado ningún Twinkly: introduzca su dirección IP en la configuración o inicie una búsqueda.',
      });
      return;
    }
    const lost = entries.filter((entry) => !entry.reachable);
    if (lost.length > 0) {
      const names = lost.map((entry) => entry.name).join(', ');
      await this.gladys.setConnectionStatus(false, {
        en: `Unreachable: ${names}.`,
        fr: `Injoignable : ${names}.`,
        de: `Nicht erreichbar: ${names}.`,
        es: `Inaccesible: ${names}.`,
      });
      return;
    }
    await this.gladys.setConnectionStatus(true);
  }

  // --- Finding the entry of a Gladys device ---------------------------------

  entryByExternalId(externalId) {
    return (
      this.registry.all().find((entry) => idsOf(this.gladys, entry).device === externalId) ?? null
    );
  }

  /**
   * The entry of a Gladys device, probing its saved IP (or rediscovering)
   * when the integration does not know it yet.
   * @param {object|string} device Gladys device, or its external_id
   */
  async ensureEntry(device) {
    const externalId = typeof device === 'string' ? device : device?.external_id;
    let entry = this.entryByExternalId(externalId);
    if (entry) {
      return entry;
    }
    const gladysDevice =
      typeof device === 'string'
        ? (this.gladys.devices ?? []).find((d) => d.external_id === externalId)
        : device;
    const ip = deviceParam(gladysDevice, 'IP_ADDRESS');
    if (ip) {
      await this.registry.probeAll([ip]);
      entry = this.entryByExternalId(externalId);
    }
    if (!entry && this.config.auto_discovery && this.rediscoveryAllowed()) {
      await this.discover();
      await this.publishDevices().catch(() => {});
      entry = this.entryByExternalId(externalId);
    }
    return entry;
  }

  rediscoveryAllowed() {
    return this.now() - this.lastDiscoveryAt >= REDISCOVERY_MIN_MS;
  }

  async requireEntry(device) {
    const entry = await this.ensureEntry(device);
    if (!entry) {
      const id = typeof device === 'string' ? device : device?.external_id;
      throw new Error(`Twinkly ${id} not found on the network`);
    }
    return entry;
  }

  // --- Reachability -----------------------------------------------------------

  async markUnreachable(entry, err) {
    entry.lastError = err?.message ?? String(err);
    if (!entry.reachable) {
      return;
    }
    entry.reachable = false;
    logger.warn(`${entry.name} is unreachable: ${entry.lastError}`);
    await this.publishTransports().catch(() => {});
    await this.publishConnectionStatus().catch(() => {});
    await fireTrigger(this.gladys, SCENE_TRIGGERS.DEVICE_OFFLINE, {
      device: idsOf(this.gladys, entry).device,
      device_name: entry.name,
    });
    this.onChange();
  }

  async markReachable(entry) {
    entry.lastError = null;
    entry.lastSeenAt = this.now();
    if (entry.reachable) {
      return;
    }
    entry.reachable = true;
    logger.info(`${entry.name} answers again`);
    await this.publishTransports().catch(() => {});
    await this.publishConnectionStatus().catch(() => {});
    await fireTrigger(this.gladys, SCENE_TRIGGERS.DEVICE_ONLINE, {
      device: idsOf(this.gladys, entry).device,
      device_name: entry.name,
    });
    this.onChange();
  }

  /** Run a device request; a lost device is marked as such, then rethrown. */
  async talk(entry, task) {
    try {
      const result = await task();
      await this.markReachable(entry);
      return result;
    } catch (err) {
      if (isConnectivityError(err)) {
        await this.markUnreachable(entry, err);
      }
      throw err;
    }
  }

  // --- State ----------------------------------------------------------------

  remember(entry, state) {
    entry.lastMode = state.mode;
    if (RESTORABLE_MODES.includes(state.mode)) {
      entry.lastActiveMode = state.mode;
    }
    entry.lastBrightness = state.brightness;
    if (state.color !== null && state.color !== undefined) {
      entry.lastColor = state.color;
    }
    if (state.scene) {
      entry.lastScene = state.scene;
    }
  }

  /**
   * Publish what the device reported. A poll only sends the values that
   * changed (Gladys takes 300 states a minute, and a fleet polled every few
   * seconds would spend it on copies), plus every value once per
   * `STATE_HEARTBEAT_MS` so a stable one stays recently dated. After a Gladys
   * order (`force`), everything is sent: the dashboard showed the value the
   * user asked for, and only the device's own answer may confirm or undo it.
   */
  async publishEntryState(entry, state, { force = false } = {}) {
    const states = statesOf(this.gladys, entry, state);
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates(idsOf(this.gladys, entry).device);
    }
    await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
  }

  /**
   * Gladys polls a device: read it, publish it, and fire `mode_changed` when
   * what it plays changed outside Gladys.
   */
  async poll(device) {
    const entry = await this.ensureEntry(device);
    if (!entry) {
      logger.debug(`Poll: ${device?.external_id} not found on the network`);
      return;
    }
    // A command sent while this poll was reading makes what it read stale:
    // comparing it would fire a mode_changed for Gladys' own order.
    const commandsBefore = entry.commands ?? 0;
    let state;
    try {
      state = await this.talk(entry, () => readState(entry));
    } catch (err) {
      if (!isConnectivityError(err)) {
        logger.warn(`Poll of ${entry.name} failed: ${err?.message ?? err}`);
      }
      return;
    }
    if ((entry.commands ?? 0) !== commandsBefore) {
      return;
    }
    const previous = entry.lastMode;
    this.remember(entry, state);
    await this.publishEntryState(entry, state);
    if (previous !== null && previous !== state.mode) {
      logger.info(`${entry.name}: mode ${previous} -> ${state.mode} (outside Gladys)`);
      await fireTrigger(this.gladys, SCENE_TRIGGERS.MODE_CHANGED, {
        device: idsOf(this.gladys, entry).device,
        device_name: entry.name,
        mode: state.mode,
        previous_mode: previous,
      });
      this.onChange();
    }
  }

  /** Re-read after a Gladys order and publish, without any trigger. */
  async refresh(entry) {
    try {
      const state = await this.talk(entry, () => readState(entry));
      this.remember(entry, state);
      await this.publishEntryState(entry, state, { force: true });
    } catch (err) {
      logger.debug(`Refresh of ${entry.name} failed: ${err?.message ?? err}`);
    }
    this.onChange();
  }

  // --- Commands ---------------------------------------------------------------

  /** Run a Gladys order on a device, then publish what it became. */
  async command(entry, task) {
    entry.commands = (entry.commands ?? 0) + 1;
    const result = await this.talk(entry, task);
    await this.refresh(entry);
    return result;
  }

  /** The mode "on" brings back. */
  turnOnMode(entry) {
    const wanted =
      this.config.turn_on_mode === TURN_ON_MODES.LAST
        ? (entry.lastActiveMode ?? null)
        : this.config.turn_on_mode;
    const usable = (mode) => {
      switch (mode) {
        case LED_MODES.MOVIE:
          return (entry.movies ?? []).length > 0;
        case LED_MODES.PLAYLIST:
          return (entry.playlist ?? []).length > 0;
        case LED_MODES.COLOR:
          return entry.hasColor;
        case LED_MODES.EFFECT:
          return true;
        default:
          return false;
      }
    };
    if (usable(wanted)) {
      return wanted;
    }
    return (entry.movies ?? []).length > 0 ? LED_MODES.MOVIE : LED_MODES.EFFECT;
  }

  async turnOn(entry) {
    const mode = this.turnOnMode(entry);
    try {
      await entry.client.setMode(mode);
      return mode;
    } catch (err) {
      // A firmware that refuses the mode (no movie after all, old firmware
      // without playlist): effects always exist.
      if (err instanceof TwinklyError && err.reason === 'api' && mode !== LED_MODES.EFFECT) {
        logger.warn(`${entry.name} refused mode ${mode}, falling back to effect`);
        await entry.client.setMode(LED_MODES.EFFECT);
        return LED_MODES.EFFECT;
      }
      throw err;
    }
  }

  /** Gladys acts on a feature. */
  async setValue(device, feature, value) {
    const entry = await this.requireEntry(device);
    const ids = idsOf(this.gladys, entry);
    switch (feature.external_id) {
      case ids.feature(FEATURES.ON_OFF):
        await this.command(entry, async () => {
          if (Number(value) > 0) {
            await this.turnOn(entry);
          } else {
            await entry.client.setMode(LED_MODES.OFF);
          }
        });
        return;
      case ids.feature(FEATURES.BRIGHTNESS):
        await this.command(entry, () => this.applyBrightness(entry, value));
        return;
      case ids.feature(FEATURES.COLOR):
        await this.command(entry, () => this.applyColor(entry, value));
        return;
      case ids.feature(FEATURES.SCENE): {
        const scene = parseScene(entry, value);
        if (!scene) {
          throw new Error(`Unknown scene "${value}" for ${entry.name}`);
        }
        await this.command(entry, () => this.startScene(entry, scene));
        return;
      }
      default:
        throw new Error(`Unknown feature ${feature.external_id}`);
    }
  }

  async applyBrightness(entry, value) {
    await entry.client.setBrightness(value);
    // Like any dimmable light: raising the level of a light that is off
    // turns it on.
    if (Number(value) > 0 && entry.lastMode === LED_MODES.OFF) {
      await this.turnOn(entry);
    }
  }

  async applyColor(entry, value) {
    await entry.client.setColor(intToRgb(value));
    await entry.client.setMode(LED_MODES.COLOR);
  }

  async startScene(entry, scene) {
    if (scene.kind === 'movie') {
      await entry.client.setCurrentMovie(scene.movie.id);
      await entry.client.setMode(LED_MODES.MOVIE);
    } else if (scene.kind === 'effect') {
      await entry.client.setCurrentEffect(scene.id);
      await entry.client.setMode(LED_MODES.EFFECT);
    } else {
      await entry.client.setMode(LED_MODES.PLAYLIST);
    }
  }

  // --- Scene actions ----------------------------------------------------------

  /**
   * Play a movie by name (case and spaces ignored) or by its position in the
   * list (1 = first). The list is read again once when nothing matches: the
   * movie may have been uploaded from the app since.
   * @returns {Promise<object>} the movie played
   */
  async playMovie(externalId, wanted) {
    const entry = await this.requireEntry(externalId);
    const find = () => {
      const movies = entry.movies ?? [];
      const text = String(wanted ?? '')
        .trim()
        .toLowerCase();
      const byName = movies.find(
        (m) =>
          String(m.name ?? '')
            .trim()
            .toLowerCase() === text,
      );
      if (byName) {
        return byName;
      }
      return /^\d+$/.test(text) ? (movies[Number(text) - 1] ?? null) : null;
    };
    let movie = find();
    if (!movie) {
      entry.movies = await this.talk(entry, () => entry.client.getMovies());
      movie = find();
    }
    if (!movie) {
      const names = (entry.movies ?? []).map((m) => m.name).join(', ') || '-';
      throw new Error(`No movie "${wanted}" on ${entry.name} (movies: ${names})`);
    }
    await this.command(entry, () => this.startScene(entry, { kind: 'movie', movie }));
    return movie;
  }

  /**
   * Play one choice of the scene list, by its select value: the path of the
   * scene feature, for a caller holding an external id (the widget form).
   * @returns {Promise<{value: string, label: string}>} the scene played
   */
  async playScene(externalId, value) {
    const entry = await this.requireEntry(externalId);
    const scene = parseScene(entry, value);
    if (!scene) {
      throw new Error(`Unknown scene "${value}" for ${entry.name}`);
    }
    await this.command(entry, () => this.startScene(entry, scene));
    return sceneOptions(entry).find((option) => option.value === value) ?? { value, label: value };
  }

  /**
   * Play a built-in effect, numbered from 1 like in the scene editor.
   * @returns {Promise<number>} the effect number played
   */
  async playEffect(externalId, number) {
    const entry = await this.requireEntry(externalId);
    const count = entry.effectCount || 0;
    if (!Number.isInteger(number) || number < 1 || (count > 0 && number > count)) {
      throw new Error(`Effect ${number} does not exist on ${entry.name} (1 to ${count})`);
    }
    await this.command(entry, () => this.startScene(entry, { kind: 'effect', id: number - 1 }));
    return number;
  }

  /**
   * Switch the mode: `on` restores the mode "on" brings back.
   * @returns {Promise<string>} the mode the device is in
   */
  async applyMode(externalId, mode) {
    if (!SET_MODE_VALUES.includes(mode)) {
      throw new Error(`Unknown mode "${mode}"`);
    }
    const entry = await this.requireEntry(externalId);
    let applied = mode;
    await this.command(entry, async () => {
      if (mode === 'on') {
        applied = await this.turnOn(entry);
      } else if (mode === LED_MODES.COLOR && !entry.hasColor) {
        throw new Error(`${entry.name} has no solid color mode (firmware too old)`);
      } else {
        await entry.client.setMode(mode);
      }
    });
    return applied;
  }

  /**
   * Move the brightness by `delta` points, kept between `BRIGHTNESS_STEP` and
   * 100 % (a lit Twinkly at 0 % looks off, and only "off" should).
   * @returns {Promise<number>} the brightness asked for
   */
  async stepBrightness(externalId, delta) {
    const entry = await this.requireEntry(externalId);
    const from = entry.lastBrightness ?? 100;
    const level = Math.min(100, Math.max(BRIGHTNESS_STEP, from + delta));
    await this.command(entry, () => this.applyBrightness(entry, level));
    return level;
  }

  /** Set the brightness, in %. */
  async setBrightness(externalId, level) {
    const entry = await this.requireEntry(externalId);
    await this.command(entry, () => this.applyBrightness(entry, level));
    return level;
  }

  /** Show a solid color (`0xRRGGBB`). */
  async setColor(externalId, color) {
    const entry = await this.requireEntry(externalId);
    if (!entry.hasColor) {
      throw new Error(`${entry.name} has no solid color mode (firmware too old)`);
    }
    await this.command(entry, () => this.applyColor(entry, color));
    return color;
  }

  /**
   * Play the next (`step` = 1) or previous (-1) choice of the scene list,
   * looping at both ends.
   * @returns {Promise<{value: string, label: string}>} the scene played
   */
  async stepScene(externalId, step) {
    const entry = await this.requireEntry(externalId);
    const options = sceneOptions(entry);
    if (options.length === 0) {
      throw new Error(`${entry.name} has no scene to play`);
    }
    const index = options.findIndex((option) => option.value === entry.lastScene);
    const start = index === -1 ? (step > 0 ? -1 : 0) : index;
    const next = options[(((start + step) % options.length) + options.length) % options.length];
    await this.command(entry, () => this.startScene(entry, parseScene(entry, next.value)));
    return next;
  }

  /** Every known device on, or off. */
  async switchAll(on) {
    const entries = this.registry.all();
    const results = await Promise.allSettled(
      entries.map((entry) =>
        this.command(entry, () => (on ? this.turnOn(entry) : entry.client.setMode(LED_MODES.OFF))),
      ),
    );
    return {
      done: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }

  // --- Identify ---------------------------------------------------------------

  /**
   * Make one device signal itself: demo mode for a few seconds, then back to
   * what it was doing (off included).
   * @returns {Promise<Record<string, string>>} `{ en, fr, de, es }` message for the user
   */
  async identify(externalId) {
    const entry = await this.ensureEntry(externalId);
    if (!entry) {
      return {
        en: 'This Twinkly does not answer on the network.',
        fr: 'Ce Twinkly ne répond pas sur le réseau.',
        de: 'Dieses Twinkly antwortet nicht im Netzwerk.',
        es: 'Este Twinkly no responde en la red.',
      };
    }
    const before = await this.talk(entry, () => entry.client.getMode());
    entry.commands = (entry.commands ?? 0) + 1;
    await this.talk(entry, () => entry.client.setMode(LED_MODES.DEMO));
    await this.wait(IDENTIFY_MS);
    entry.commands += 1;
    // `rt` (real time) needs a live stream nobody sends any more: come back
    // to "on" instead.
    const back = before === LED_MODES.RT ? this.turnOnMode(entry) : before;
    await this.talk(entry, () => entry.client.setMode(back));
    await this.refresh(entry);
    return {
      en: `${entry.name} played its demo for ${IDENTIFY_MS / 1000} seconds.`,
      fr: `${entry.name} a joué sa démo pendant ${IDENTIFY_MS / 1000} secondes.`,
      de: `${entry.name} hat ${IDENTIFY_MS / 1000} Sekunden lang seine Demo abgespielt.`,
      es: `${entry.name} ha reproducido su demo durante ${IDENTIFY_MS / 1000} segundos.`,
    };
  }

  // --- "Test the connection" ----------------------------------------------------

  /**
   * Run a discovery and say, in every language, what answered.
   * @returns {Promise<Record<string, string>>} `{ en, fr, de, es }`
   */
  async testConnection() {
    const result = await this.discover();
    await this.publishDevices();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.onChange();

    const lines = [];
    if (result.scanned) {
      if (result.scanError) {
        const error = result.scanError;
        lines.push({
          en: `Network scan unavailable (${error}): type the IP addresses.`,
          fr: `Recherche réseau indisponible (${error}) : saisissez les adresses IP.`,
          de: `Netzwerksuche nicht verfügbar (${error}): Gib die IP-Adressen ein.`,
          es: `Búsqueda en la red no disponible (${error}): introduzca las direcciones IP.`,
        });
      } else {
        lines.push({
          en: 'Network scan done.',
          fr: 'Recherche réseau effectuée.',
          de: 'Netzwerksuche durchgeführt.',
          es: 'Búsqueda en la red realizada.',
        });
      }
    }
    if (result.found.length === 0) {
      lines.push({
        en: 'No Twinkly answered.',
        fr: "Aucun Twinkly n'a répondu.",
        de: 'Kein Twinkly hat geantwortet.',
        es: 'Ningún Twinkly ha respondido.',
      });
    }
    for (const entry of result.found) {
      const mode = await entry.client.getMode().catch(() => null);
      const label = mode ? modeLabel(mode) : { en: '?', fr: '?', de: '?', es: '?' };
      const fw = entry.firmware ? ` fw ${entry.firmware}` : '';
      const where = `${entry.name} (${entry.host}, ${entry.ledCount}`;
      lines.push({
        en: `${where} LEDs${fw}): ${label.en}.`,
        fr: `${where} LED${fw}) : ${label.fr}.`,
        de: `${where} LEDs${fw}): ${label.de}.`,
        es: `${where} LED${fw}): ${label.es}.`,
      });
    }
    for (const failure of result.failed) {
      lines.push({
        en: `${failure.host}: no answer.`,
        fr: `${failure.host} : pas de réponse.`,
        de: `${failure.host}: keine Antwort.`,
        es: `${failure.host}: sin respuesta.`,
      });
    }
    return joinTexts(lines);
  }
}
