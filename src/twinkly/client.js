// -----------------------------------------------------------------------------
// Local client of ONE Twinkly device: its REST API on the LAN (`/xled/v1/...`).
//
// Twinkly has no public cloud API: the app itself drives the lights over the
// local network, and so does this integration. What the protocol asks for:
//
//   - a token: POST /login with a random challenge, then POST /verify with the
//     answer. The token lasts 4 hours (`authentication_token_expires_in`) and
//     goes in the `X-Auth-Token` header. It is renewed a minute before it ends,
//     and once more when the device answers 401 (it rebooted, or the app took
//     a new token and invalidated ours).
//   - one request at a time: the controller is a small ESP chip that drops
//     concurrent connections, so the requests of a device are queued.
//   - every JSON answer carries `code`: 1000 means OK, anything else failed
//     even under HTTP 200.
//
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';

/** API answer code meaning success. */
export const API_OK = 1000;

/** Renew the token this long before the device says it ends. */
const TOKEN_MARGIN_MS = 60 * 1000;

/** Twinkly LED modes, as the API names them. */
export const LED_MODES = {
  OFF: 'off',
  COLOR: 'color',
  DEMO: 'demo',
  EFFECT: 'effect',
  MOVIE: 'movie',
  PLAYLIST: 'playlist',
  RT: 'rt',
};

/** An error from a Twinkly device, with a short machine `reason`. */
export class TwinklyError extends Error {
  /**
   * @param {string} message
   * @param {object} details
   * @param {'unreachable'|'timeout'|'http'|'api'|'auth'} details.reason
   * @param {number} [details.status] HTTP status
   * @param {number} [details.code] Twinkly API code
   */
  constructor(message, { reason, status, code } = {}) {
    super(message);
    this.name = 'TwinklyError';
    this.reason = reason;
    this.status = status;
    this.code = code;
  }
}

export class TwinklyClient {
  /**
   * @param {string} host IPv4 address or host name, optionally with `:port`
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeoutMs] per request
   * @param {() => number} [options.now] clock
   */
  constructor(host, { fetch = globalThis.fetch, timeoutMs = 5000, now = Date.now } = {}) {
    this.host = host;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.queue = Promise.resolve();
  }

  get baseUrl() {
    return `http://${this.host}/xled/v1`;
  }

  /** Run `task` after every request already queued for this device. */
  enqueue(task) {
    const run = this.queue.then(task, task);
    // The queue must survive a failed request.
    this.queue = run.catch(() => {});
    return run;
  }

  /** One raw HTTP exchange, JSON in and out. Not queued. */
  async exchange(method, path, body, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new TwinklyError(`${this.host} did not answer within ${this.timeoutMs} ms`, {
          reason: 'timeout',
        });
      }
      throw new TwinklyError(`${this.host} is unreachable: ${err?.message ?? err}`, {
        reason: 'unreachable',
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      throw new TwinklyError(`${this.host} refused the token`, { reason: 'auth', status: 401 });
    }
    if (!response.ok) {
      throw new TwinklyError(`${this.host} answered HTTP ${response.status} to ${path}`, {
        reason: 'http',
        status: response.status,
      });
    }
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new TwinklyError(`${this.host} sent an unreadable answer to ${path}`, {
          reason: 'http',
          status: response.status,
        });
      }
    }
    if (data.code !== undefined && data.code !== API_OK) {
      throw new TwinklyError(`${this.host} refused ${path} (code ${data.code})`, {
        reason: 'api',
        code: data.code,
      });
    }
    return data;
  }

  /** Get a fresh token: login with a random challenge, then verify. */
  async login() {
    const challenge = randomBytes(32).toString('base64');
    const answer = await this.exchange('POST', '/login', { challenge });
    if (!answer.authentication_token) {
      throw new TwinklyError(`${this.host} gave no token`, { reason: 'auth' });
    }
    this.token = answer.authentication_token;
    const lifetimeMs = Number(answer.authentication_token_expires_in ?? 14400) * 1000;
    this.tokenExpiresAt = this.now() + lifetimeMs - TOKEN_MARGIN_MS;
    await this.exchange(
      'POST',
      '/verify',
      { 'challenge-response': answer['challenge-response'] },
      { 'X-Auth-Token': this.token },
    );
  }

  /** Forget the token (next request logs in again). */
  forgetToken() {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Queued, authenticated request. A 401 means the token died before its
   * time (reboot, the app logged in): log in again and retry once.
   */
  request(method, path, body, { auth = true } = {}) {
    return this.enqueue(async () => {
      if (!auth) {
        return this.exchange(method, path, body);
      }
      if (!this.token || this.now() >= this.tokenExpiresAt) {
        await this.login();
      }
      try {
        return await this.exchange(method, path, body, { 'X-Auth-Token': this.token });
      } catch (err) {
        if (err instanceof TwinklyError && err.reason === 'auth') {
          this.forgetToken();
          await this.login();
          return this.exchange(method, path, body, { 'X-Auth-Token': this.token });
        }
        throw err;
      }
    });
  }

  // --- Device information ---------------------------------------------------

  /** Device description (name, MAC, LED count...). No token needed. */
  gestalt() {
    return this.request('GET', '/gestalt', undefined, { auth: false });
  }

  async firmwareVersion() {
    const answer = await this.request('GET', '/fw/version', undefined, { auth: false });
    return answer.version ?? null;
  }

  // --- LED mode -------------------------------------------------------------

  async getMode() {
    return (await this.request('GET', '/led/mode')).mode;
  }

  async setMode(mode) {
    await this.request('POST', '/led/mode', { mode });
  }

  // --- Brightness (0-100 %) -------------------------------------------------

  async getBrightness() {
    const answer = await this.request('GET', '/led/out/brightness');
    // `mode: disabled` means the dimmer is bypassed: full brightness.
    return answer.mode === 'disabled' ? 100 : Number(answer.value ?? 100);
  }

  async setBrightness(value) {
    const level = Math.max(0, Math.min(100, Math.round(Number(value))));
    await this.request('POST', '/led/out/brightness', { mode: 'enabled', type: 'A', value: level });
  }

  // --- Solid color (firmware 2.7.1 and later) -------------------------------

  /** @returns {Promise<{red: number, green: number, blue: number}>} */
  async getColor() {
    const answer = await this.request('GET', '/led/color');
    return {
      red: Number(answer.red ?? 0),
      green: Number(answer.green ?? 0),
      blue: Number(answer.blue ?? 0),
    };
  }

  async setColor({ red, green, blue }) {
    await this.request('POST', '/led/color', { red, green, blue });
  }

  // --- Movies (the animations uploaded from the app) ------------------------

  /** @returns {Promise<Array<{id: number, name: string, unique_id?: string}>>} */
  async getMovies() {
    const answer = await this.request('GET', '/movies');
    return Array.isArray(answer.movies) ? answer.movies : [];
  }

  async getCurrentMovie() {
    return this.request('GET', '/movies/current');
  }

  async setCurrentMovie(id) {
    await this.request('POST', '/movies/current', { id: Number(id) });
  }

  // --- Built-in effects -----------------------------------------------------

  /** @returns {Promise<number>} how many effects the device has */
  async getEffectCount() {
    const answer = await this.request('GET', '/led/effects');
    return Number(answer.effects_number ?? 0);
  }

  async getCurrentEffect() {
    return Number((await this.request('GET', '/led/effects/current')).effect_id ?? 0);
  }

  async setCurrentEffect(id) {
    await this.request('POST', '/led/effects/current', { effect_id: Number(id) });
  }

  // --- Playlist -------------------------------------------------------------

  /** @returns {Promise<Array<{id: number, name: string}>>} */
  async getPlaylist() {
    const answer = await this.request('GET', '/playlist');
    return Array.isArray(answer.entries) ? answer.entries : [];
  }
}

/** RGB components -> the integer Gladys stores for a color (0xRRGGBB). */
export function rgbToInt({ red, green, blue }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return (clamp(red) << 16) + (clamp(green) << 8) + clamp(blue);
}

/** The integer Gladys sends for a color -> RGB components. */
export function intToRgb(value) {
  const n = Math.max(0, Math.min(0xffffff, Math.round(Number(value) || 0)));
  return { red: (n >> 16) & 0xff, green: (n >> 8) & 0xff, blue: n & 0xff };
}
