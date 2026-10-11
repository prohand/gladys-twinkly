// -----------------------------------------------------------------------------
// In-memory Twinkly devices behind a fake `fetch`, for unit tests.
//
// It answers the `/xled/v1/...` routes the client uses, enforces the token
// (login + verify, `X-Auth-Token`), and lets a test unplug a device
// (`device.reachable = false`), refuse a mode (`device.refusedModes`) or kill
// the token (`device.token = null`, the next request gets a 401).
// -----------------------------------------------------------------------------

let macCounter = 0;

/** A Twinkly with sensible defaults; override any field. */
export function makeDevice(overrides = {}) {
  macCounter += 1;
  const suffix = macCounter.toString(16).padStart(2, '0');
  return {
    reachable: true,
    token: null,
    logins: 0,
    calls: [],
    refusedModes: [],
    gestalt: {
      product_name: 'Twinkly',
      device_name: `Twinkly_${suffix.toUpperCase()}`,
      mac: `98:f4:ab:33:aa:${suffix}`,
      number_of_led: 250,
      led_profile: 'RGB',
      product_code: 'TWS250STP-B',
      code: 1000,
    },
    firmware: '2.8.3',
    mode: 'movie',
    brightness: 80,
    color: { red: 255, green: 0, blue: 0 },
    movies: [
      { id: 0, name: 'Snowfall', unique_id: 'aaa-111' },
      { id: 1, name: 'Fireworks', unique_id: 'bbb-222' },
    ],
    currentMovie: 0,
    effects: 5,
    currentEffect: 0,
    playlist: [{ id: 0, name: 'Snowfall' }],
    ...overrides,
  };
}

function reply(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    },
  };
}

const OK = { code: 1000 };

/**
 * @param {Record<string, object>} devices host -> device (see makeDevice)
 * @returns {{fetch: Function, devices: Record<string, object>}}
 */
export function createFakeTwinkly(devices) {
  async function fetch(url, init = {}) {
    const { host, pathname } = new URL(url);
    const device = devices[host];
    if (!device || !device.reachable) {
      throw new TypeError('fetch failed');
    }
    const method = init.method ?? 'GET';
    const path = pathname.replace(/^\/xled\/v1/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    device.calls.push({ method, path, body });

    // Routes that need no token.
    if (path === '/login' && method === 'POST') {
      device.logins += 1;
      device.pendingToken = `token-${device.logins}`;
      return reply(200, {
        authentication_token: device.pendingToken,
        authentication_token_expires_in: 14400,
        'challenge-response': 'answer',
        code: 1000,
      });
    }
    if (path === '/verify' && method === 'POST') {
      if (init.headers?.['X-Auth-Token'] !== device.pendingToken) {
        return reply(401);
      }
      device.token = device.pendingToken;
      return reply(200, OK);
    }
    if (path === '/gestalt') {
      return reply(200, device.gestalt);
    }
    if (path === '/fw/version') {
      return reply(200, { version: device.firmware, code: 1000 });
    }

    if (!device.token || init.headers?.['X-Auth-Token'] !== device.token) {
      return reply(401);
    }

    switch (`${method} ${path}`) {
      case 'GET /led/mode':
        return reply(200, { mode: device.mode, code: 1000 });
      case 'POST /led/mode':
        if (device.refusedModes.includes(body.mode)) {
          return reply(200, { code: 1104 });
        }
        device.mode = body.mode;
        return reply(200, OK);
      case 'GET /led/out/brightness':
        return reply(200, { mode: 'enabled', value: device.brightness, code: 1000 });
      case 'POST /led/out/brightness':
        device.brightness = body.value;
        return reply(200, OK);
      case 'GET /led/color':
        return device.color ? reply(200, { ...device.color, code: 1000 }) : reply(404);
      case 'POST /led/color':
        device.color = { red: body.red, green: body.green, blue: body.blue };
        return reply(200, OK);
      case 'GET /movies':
        return reply(200, { movies: device.movies, code: 1000 });
      case 'GET /movies/current': {
        const movie = device.movies.find((m) => m.id === device.currentMovie) ?? {};
        return reply(200, {
          id: movie.id,
          unique_id: movie.unique_id,
          name: movie.name,
          code: 1000,
        });
      }
      case 'POST /movies/current':
        device.currentMovie = body.id;
        return reply(200, OK);
      case 'GET /led/effects':
        return reply(200, { effects_number: device.effects, code: 1000 });
      case 'GET /led/effects/current':
        return reply(200, { effect_id: device.currentEffect, code: 1000 });
      case 'POST /led/effects/current':
        device.currentEffect = body.effect_id;
        return reply(200, OK);
      case 'GET /playlist':
        return reply(200, { entries: device.playlist, code: 1000 });
      default:
        return reply(404);
    }
  }
  return { fetch, devices };
}
