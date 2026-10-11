// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+): the Twinkly devices from the dashboard.
//
// Two views, chosen by the per-instance `device` setting:
//   - no device: every Twinkly at a glance (one status row each) and two
//     buttons a light switch cannot give, everything on, everything off;
//   - one device: its live brightness, what it plays, its details, and a set
//     of buttons picked by the `buttons` setting (scenes, brightness, modes,
//     colors). A card holds 4 buttons at most, so each set is one card: add
//     the widget several times to get them all.
// The content is declarative, the core renders it (see the "Dashboard widgets"
// section of the SDK README): at most 10 status rows and 4 buttons.
//
// The widget key, the setting keys and their values are stored by the
// dashboards users build: never rename them.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LED_MODES } from '../twinkly/client.js';
import { modeLabel } from '../twinkly/labels.js';
import { FEATURES, PLAYLIST_SCENE, idsOf, sceneOptions } from '../devices/twinkly.js';
import { BRIGHTNESS_STEP } from '../twinkly/service.js';

const logger = createLogger({ name: 'widget' });

/** Key of the manifest widget. */
export const OVERVIEW_WIDGET = 'twinkly_overview';

/** Keys of the widget buttons. */
export const WIDGET_ACTIONS = {
  ALL_ON: 'all_on',
  ALL_OFF: 'all_off',
  TURN_ON: 'turn_on',
  TURN_OFF: 'turn_off',
  PREVIOUS_SCENE: 'previous_scene',
  NEXT_SCENE: 'next_scene',
  IDENTIFY: 'identify',
  BRIGHTNESS_DOWN: 'brightness_down',
  BRIGHTNESS_UP: 'brightness_up',
  BRIGHTNESS_MAX: 'brightness_max',
};

/**
 * Mode and color buttons: one action key each (the core drops a button whose
 * key another button already carries), `mode_<LED mode>` and `color_<preset>`.
 */
export const MODE_ACTION_PREFIX = 'mode_';
export const COLOR_ACTION_PREFIX = 'color_';

/** Values of the `buttons` setting: which set a one-device card shows. */
export const BUTTON_SETS = {
  SCENES: 'scenes',
  BRIGHTNESS: 'brightness',
  MODES: 'modes',
  COLORS: 'colors',
};

/** Modes the "modes" set offers, in this order, when the device can play them. */
const MODE_BUTTONS = [LED_MODES.MOVIE, LED_MODES.PLAYLIST, LED_MODES.COLOR, LED_MODES.EFFECT];

/** Colors of the "colors" set. */
export const COLOR_PRESETS = [
  { key: 'white', color: 0xffffff, label: { en: 'White', fr: 'Blanc' } },
  { key: 'red', color: 0xff0000, label: { en: 'Red', fr: 'Rouge' } },
  { key: 'green', color: 0x00ff00, label: { en: 'Green', fr: 'Vert' } },
  { key: 'blue', color: 0x0000ff, label: { en: 'Blue', fr: 'Bleu' } },
];

/** The status component holds 10 rows at most. */
const MAX_ROWS = 10;

function deviceRow(entry) {
  if (!entry.reachable) {
    return {
      label: entry.name,
      icon: 'wifi-off',
      value: { en: 'Unreachable', fr: 'Injoignable' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (entry.lastMode === null || entry.lastMode === undefined) {
    return {
      label: entry.name,
      icon: 'star',
      value: { en: 'Not read yet', fr: 'Pas encore lu' },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  const mode = modeLabel(entry.lastMode);
  if (entry.lastMode === LED_MODES.OFF) {
    return { label: entry.name, icon: 'moon', value: mode, color: WIDGET_COLORS.NEUTRAL };
  }
  const level = entry.lastBrightness === null ? '' : ` · ${entry.lastBrightness} %`;
  return {
    label: entry.name,
    icon: 'star',
    value: { en: `${mode.en}${level}`, fr: `${mode.fr}${level}` },
    color: WIDGET_COLORS.SUCCESS,
  };
}

/** `{ en, fr }` name of a scene select value, null when unknown. */
export function sceneLabel(entry, value) {
  if (value === PLAYLIST_SCENE) {
    return { en: 'Playlist', fr: 'Playlist' };
  }
  if (String(value ?? '').startsWith('effect:')) {
    const n = Number(String(value).slice('effect:'.length)) + 1;
    return { en: `Effect ${n}`, fr: `Effet ${n}` };
  }
  const option = sceneOptions(entry).find((o) => o.value === value);
  return option ? { en: option.label, fr: option.label } : null;
}

const actionButton = (key, label, icon, style = 'secondary') => ({
  type: 'button',
  label,
  icon,
  style,
  action: { key },
});

/** On when off, off when on: one button for both, the content follows. */
function toggleButton(entry) {
  return entry.lastMode === LED_MODES.OFF
    ? actionButton(WIDGET_ACTIONS.TURN_ON, { en: 'Turn on', fr: 'Allumer' }, 'sun', 'primary')
    : actionButton(WIDGET_ACTIONS.TURN_OFF, { en: 'Turn off', fr: 'Éteindre' }, 'moon');
}

function modeUsable(entry, mode) {
  switch (mode) {
    case LED_MODES.MOVIE:
      return (entry.movies ?? []).length > 0;
    case LED_MODES.PLAYLIST:
      return (entry.playlist ?? []).length > 0;
    case LED_MODES.COLOR:
      return Boolean(entry.hasColor);
    default:
      return true;
  }
}

function buttonsOf(entry, set) {
  switch (set) {
    case BUTTON_SETS.BRIGHTNESS:
      return [
        toggleButton(entry),
        actionButton(WIDGET_ACTIONS.BRIGHTNESS_DOWN, `− ${BRIGHTNESS_STEP} %`, 'minus'),
        actionButton(WIDGET_ACTIONS.BRIGHTNESS_UP, `+ ${BRIGHTNESS_STEP} %`, 'plus'),
        actionButton(WIDGET_ACTIONS.BRIGHTNESS_MAX, { en: 'Max', fr: 'Max' }, 'sun'),
      ];
    case BUTTON_SETS.MODES:
      return [
        toggleButton(entry),
        ...MODE_BUTTONS.filter((mode) => modeUsable(entry, mode))
          .slice(0, 3)
          .map((mode) => actionButton(`${MODE_ACTION_PREFIX}${mode}`, modeLabel(mode), 'play')),
      ];
    case BUTTON_SETS.COLORS:
      if (!entry.hasColor) {
        return [toggleButton(entry)];
      }
      return COLOR_PRESETS.map(({ key, label }) =>
        actionButton(`${COLOR_ACTION_PREFIX}${key}`, label, 'droplet'),
      );
    default:
      return [
        toggleButton(entry),
        actionButton(
          WIDGET_ACTIONS.PREVIOUS_SCENE,
          { en: 'Previous', fr: 'Précédente' },
          'skip-back',
        ),
        actionButton(WIDGET_ACTIONS.NEXT_SCENE, { en: 'Next', fr: 'Suivante' }, 'skip-forward'),
        actionButton(WIDGET_ACTIONS.IDENTIFY, { en: 'Identify', fr: 'Identifier' }, 'eye'),
      ];
  }
}

const hex = (color) => `#${Number(color).toString(16).padStart(6, '0')}`;

function detailRows(entry) {
  const rows = [deviceRow(entry)];
  rows[0] = { ...rows[0], label: { en: 'State', fr: 'État' } };
  const scene = entry.lastMode === LED_MODES.OFF ? null : sceneLabel(entry, entry.lastScene);
  if (scene) {
    rows.push({ label: { en: 'Scene', fr: 'Scène' }, icon: 'film', value: scene });
  }
  if (entry.hasColor && entry.lastColor !== null && entry.lastColor !== undefined) {
    rows.push({
      label: { en: 'Color', fr: 'Couleur' },
      icon: 'droplet',
      value: hex(entry.lastColor),
    });
  }
  rows.push({ label: { en: 'IP address', fr: 'Adresse IP' }, icon: 'wifi', value: entry.host });
  rows.push({ label: { en: 'LEDs', fr: 'LED' }, icon: 'zap', value: entry.ledCount ?? 0 });
  if (entry.firmware) {
    rows.push({ label: { en: 'Firmware', fr: 'Firmware' }, icon: 'cpu', value: entry.firmware });
  }
  return rows;
}

/** The content of a one-device card. */
export function buildDeviceView(service, settings) {
  const entry = service.entryByExternalId(settings.device);
  if (!entry) {
    return {
      ttl_seconds: 60,
      components: [
        {
          type: 'text',
          text: {
            en: 'This Twinkly is not found on the network yet.',
            fr: "Ce Twinkly n'est pas encore trouvé sur le réseau.",
          },
        },
      ],
    };
  }
  const ids = idsOf(service.gladys, entry);
  const components = [
    { type: 'text', variant: 'heading', text: entry.name },
    // Device-bound: follows the published states live, no nudge needed.
    {
      type: 'gauge',
      label: { en: 'Brightness', fr: 'Luminosité' },
      device_feature: ids.feature(FEATURES.BRIGHTNESS),
      unit: '%',
    },
    { type: 'status', items: detailRows(entry) },
  ];
  if (settings.buttons === BUTTON_SETS.COLORS && !entry.hasColor) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'No solid color on this Twinkly (firmware too old).',
        fr: 'Pas de couleur fixe sur ce Twinkly (firmware trop ancien).',
      },
    });
  }
  // A lost device takes no order: its buttons would only fail.
  if (entry.reachable) {
    components.push(...buttonsOf(entry, settings.buttons));
  }
  return { ttl_seconds: 120, components };
}

/**
 * The widget content.
 * @param {import('../twinkly/service.js').TwinklyService} service
 * @param {object} [settings] the widget instance settings
 */
export function buildOverview(service, settings = {}) {
  if (settings.device) {
    return buildDeviceView(service, settings);
  }
  const entries = service.registry.all();
  if (entries.length === 0) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: 'No Twinkly found yet. Open the integration configuration to add one.',
            fr: "Aucun Twinkly trouvé. Ouvrez la configuration de l'intégration pour en ajouter un.",
          },
        },
      ],
    };
  }
  return {
    // The rows follow the poll; index.js nudges the widget on every change it
    // sees (mode, reachability), the TTL is the safety net.
    ttl_seconds: 120,
    components: [
      { type: 'status', items: entries.slice(0, MAX_ROWS).map(deviceRow) },
      {
        type: 'button',
        label: { en: 'All on', fr: 'Tout allumer' },
        icon: 'sun',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.ALL_ON },
      },
      {
        type: 'button',
        label: { en: 'All off', fr: 'Tout éteindre' },
        icon: 'moon',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.ALL_OFF },
      },
    ],
  };
}

async function runAllAction(service, on) {
  const { done, failed } = await service.switchAll(on);
  if (failed > 0) {
    return {
      en: `${done} Twinkly done, ${failed} did not answer.`,
      fr: `${done} Twinkly fait(s), ${failed} sans réponse.`,
    };
  }
  return on
    ? { en: `${done} Twinkly on.`, fr: `${done} Twinkly allumé(s).` }
    : { en: `${done} Twinkly off.`, fr: `${done} Twinkly éteint(s).` };
}

const modeOfAction = (actionKey) =>
  MODE_BUTTONS.find((mode) => actionKey === `${MODE_ACTION_PREFIX}${mode}`) ?? null;

const presetOfAction = (actionKey) =>
  COLOR_PRESETS.find((p) => actionKey === `${COLOR_ACTION_PREFIX}${p.key}`) ?? null;

/** A button of a one-device card, on the device of the instance settings. */
async function runDeviceAction(service, actionKey, device) {
  if (!device) {
    throw new Error(`Widget action ${actionKey} needs a Twinkly in the widget settings`);
  }
  const mode = modeOfAction(actionKey);
  if (mode) {
    const label = modeLabel(await service.applyMode(device, mode));
    return { en: `Mode: ${label.en}.`, fr: `Mode : ${label.fr}.` };
  }
  const preset = presetOfAction(actionKey);
  if (preset) {
    await service.setColor(device, preset.color);
    return { en: `Color: ${preset.label.en}.`, fr: `Couleur : ${preset.label.fr}.` };
  }
  switch (actionKey) {
    case WIDGET_ACTIONS.TURN_ON:
    case WIDGET_ACTIONS.TURN_OFF: {
      const on = actionKey === WIDGET_ACTIONS.TURN_ON;
      await service.applyMode(device, on ? 'on' : LED_MODES.OFF);
      return on
        ? { en: 'Twinkly on.', fr: 'Twinkly allumé.' }
        : { en: 'Twinkly off.', fr: 'Twinkly éteint.' };
    }
    case WIDGET_ACTIONS.PREVIOUS_SCENE:
    case WIDGET_ACTIONS.NEXT_SCENE: {
      const scene = await service.stepScene(
        device,
        actionKey === WIDGET_ACTIONS.NEXT_SCENE ? 1 : -1,
      );
      const entry = service.entryByExternalId(device);
      const label = (entry && sceneLabel(entry, scene.value)) ?? {
        en: scene.label,
        fr: scene.label,
      };
      return { en: `Playing ${label.en}.`, fr: `Lecture : ${label.fr}.` };
    }
    case WIDGET_ACTIONS.IDENTIFY:
      return service.identify(device);
    case WIDGET_ACTIONS.BRIGHTNESS_DOWN:
    case WIDGET_ACTIONS.BRIGHTNESS_UP:
    case WIDGET_ACTIONS.BRIGHTNESS_MAX: {
      const level =
        actionKey === WIDGET_ACTIONS.BRIGHTNESS_MAX
          ? await service.setBrightness(device, 100)
          : await service.stepBrightness(
              device,
              actionKey === WIDGET_ACTIONS.BRIGHTNESS_UP ? BRIGHTNESS_STEP : -BRIGHTNESS_STEP,
            );
      return { en: `Brightness ${level} %.`, fr: `Luminosité ${level} %.` };
    }
    default:
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
}

/** A tapped button. Resolves the toast shown to the user. */
export async function runOverviewAction(service, actionKey, settings = {}) {
  logger.info(`Widget action ${actionKey}`);
  if (actionKey === WIDGET_ACTIONS.ALL_ON || actionKey === WIDGET_ACTIONS.ALL_OFF) {
    return runAllAction(service, actionKey === WIDGET_ACTIONS.ALL_ON);
  }
  const known =
    Object.values(WIDGET_ACTIONS).includes(actionKey) ||
    modeOfAction(actionKey) ||
    presetOfAction(actionKey);
  if (!known) {
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  return runDeviceAction(service, actionKey, settings.device);
}

/** Widget handlers, keyed by the manifest `widgets` key. */
export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    get: (service, { settings } = {}) => buildOverview(service, settings ?? {}),
    action: (service, { actionKey, settings } = {}) =>
      runOverviewAction(service, actionKey, settings ?? {}),
  },
};

/** Ask the core to re-pull every widget now (fire-and-forget, rate-limited). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
