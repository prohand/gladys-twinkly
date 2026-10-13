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
// The "modes" set carries a "Play…" button that opens a form (Gladys 5.2+):
// every mode, movie and effect of THAT device in one select, plus an optional
// brightness — the one way to reach the fifth effect from a wall panel without
// tapping "next" five times.
// The content is declarative, the core renders it (see the "Dashboard widgets"
// section of the SDK README): at most 10 status rows and 4 buttons.
//
// The widget key, the setting keys and their values are stored by the
// dashboards users build: never rename them.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LED_MODES } from '../twinkly/client.js';
import { mapText, modeLabel, sameText } from '../twinkly/labels.js';
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
  PLAY: 'play',
};

/** Fields of the form behind the "Play…" button. */
export const PLAY_FIELDS = {
  WHAT: 'what',
  BRIGHTNESS: 'brightness',
};

/** Prefix of the mode choices of the "Play…" select; scenes keep their own values. */
const PLAY_MODE_PREFIX = 'mode:';

/** Modes the "Play…" select offers before the movies and effects. */
const PLAY_MODES = [
  LED_MODES.MOVIE,
  LED_MODES.PLAYLIST,
  LED_MODES.COLOR,
  LED_MODES.EFFECT,
  LED_MODES.DEMO,
];

/** The core truncates a form option label past 40 characters: cut it ourselves. */
const MAX_OPTION_LABEL = 40;

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
  { key: 'white', color: 0xffffff, label: { en: 'White', fr: 'Blanc', de: 'Weiß', es: 'Blanco' } },
  { key: 'red', color: 0xff0000, label: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' } },
  { key: 'green', color: 0x00ff00, label: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' } },
  { key: 'blue', color: 0x0000ff, label: { en: 'Blue', fr: 'Bleu', de: 'Blau', es: 'Azul' } },
];

/** The status component holds 10 rows at most. */
const MAX_ROWS = 10;

function deviceRow(entry) {
  if (!entry.reachable) {
    return {
      label: entry.name,
      icon: 'wifi-off',
      value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (entry.lastMode === null || entry.lastMode === undefined) {
    return {
      label: entry.name,
      icon: 'star',
      value: {
        en: 'Not read yet',
        fr: 'Pas encore lu',
        de: 'Noch nicht gelesen',
        es: 'Aún no leído',
      },
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
    value: mapText(mode, (text) => `${text}${level}`),
    color: WIDGET_COLORS.SUCCESS,
  };
}

/** Multi-language name of a scene select value, null when unknown. */
export function sceneLabel(entry, value) {
  if (value === PLAYLIST_SCENE) {
    return modeLabel(LED_MODES.PLAYLIST);
  }
  if (String(value ?? '').startsWith('effect:')) {
    const n = Number(String(value).slice('effect:'.length)) + 1;
    return effectLabel(n);
  }
  const option = sceneOptions(entry).find((o) => o.value === value);
  return option ? sameText(option.label) : null;
}

/** Multi-language name of the effect numbered `n` (from 1). */
function effectLabel(n) {
  return { en: `Effect ${n}`, fr: `Effet ${n}`, de: `Effekt ${n}`, es: `Efecto ${n}` };
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
    ? actionButton(
        WIDGET_ACTIONS.TURN_ON,
        { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
        'sun',
        'primary',
      )
    : actionButton(
        WIDGET_ACTIONS.TURN_OFF,
        { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
        'moon',
      );
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

/** What precedes a movie name in the "Play…" select. */
const MOVIE_PREFIX = { en: 'Movie: ', fr: 'Animation : ', de: 'Animation: ', es: 'Animación: ' };

const clip = (text) =>
  text.length > MAX_OPTION_LABEL ? `${text.slice(0, MAX_OPTION_LABEL - 1)}…` : text;

/**
 * The choices of the "Play…" select, built from what THIS device holds when
 * the content is built (a form carries static options, never a `source`):
 * the modes it can play, then its movies and its effects. The playlist scene
 * is left out, the playlist mode already starts it.
 * @returns {Array<{value: string, label: Record<string, string>}>}
 */
export function playOptions(entry) {
  const modes = PLAY_MODES.filter((mode) => modeUsable(entry, mode)).map((mode) => ({
    value: `${PLAY_MODE_PREFIX}${mode}`,
    label: modeLabel(mode),
  }));
  const scenes = sceneOptions(entry)
    .filter((option) => option.value !== PLAYLIST_SCENE)
    .map((option) => {
      const label = sceneLabel(entry, option.value);
      if (option.value.startsWith('movie:')) {
        return {
          value: option.value,
          label: mapText(label, (text, lang) => clip(MOVIE_PREFIX[lang] + text)),
        };
      }
      return { value: option.value, label: mapText(label, clip) };
    });
  return [...modes, ...scenes];
}

/** The "Play…" button: its form opens inside the card on a tap. */
function playButton(entry) {
  const options = playOptions(entry);
  // What plays now is the natural starting point of the form.
  const current =
    entry.lastMode !== LED_MODES.OFF && options.some((o) => o.value === entry.lastScene)
      ? entry.lastScene
      : options[0].value;
  return {
    type: 'button',
    label: { en: 'Play…', fr: 'Jouer…', de: 'Abspielen…', es: 'Reproducir…' },
    icon: 'list',
    style: 'primary',
    action: {
      key: WIDGET_ACTIONS.PLAY,
      fields: [
        {
          key: PLAY_FIELDS.WHAT,
          type: 'select',
          label: { en: 'What to play', fr: 'Que jouer', de: 'Was abspielen', es: 'Qué reproducir' },
          required: true,
          default: current,
          options,
        },
        {
          // No default: an empty field leaves the brightness as it is.
          key: PLAY_FIELDS.BRIGHTNESS,
          type: 'number',
          label: {
            en: 'Brightness (%)',
            fr: 'Luminosité (%)',
            de: 'Helligkeit (%)',
            es: 'Brillo (%)',
          },
          placeholder: { en: 'Unchanged', fr: 'Inchangée', de: 'Unverändert', es: 'Sin cambios' },
          required: false,
          min: BRIGHTNESS_STEP,
          max: 100,
        },
      ],
    },
  };
}

function buttonsOf(entry, set) {
  switch (set) {
    case BUTTON_SETS.BRIGHTNESS:
      return [
        toggleButton(entry),
        actionButton(WIDGET_ACTIONS.BRIGHTNESS_DOWN, `− ${BRIGHTNESS_STEP} %`, 'minus'),
        actionButton(WIDGET_ACTIONS.BRIGHTNESS_UP, `+ ${BRIGHTNESS_STEP} %`, 'plus'),
        actionButton(
          WIDGET_ACTIONS.BRIGHTNESS_MAX,
          { en: 'Max', fr: 'Max', de: 'Max', es: 'Máx' },
          'sun',
        ),
      ];
    case BUTTON_SETS.MODES:
      return [
        toggleButton(entry),
        playButton(entry),
        ...MODE_BUTTONS.filter((mode) => modeUsable(entry, mode))
          .slice(0, 2)
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
          { en: 'Previous', fr: 'Précédente', de: 'Vorherige', es: 'Anterior' },
          'skip-back',
        ),
        actionButton(
          WIDGET_ACTIONS.NEXT_SCENE,
          { en: 'Next', fr: 'Suivante', de: 'Nächste', es: 'Siguiente' },
          'skip-forward',
        ),
        actionButton(
          WIDGET_ACTIONS.IDENTIFY,
          { en: 'Identify', fr: 'Identifier', de: 'Identifizieren', es: 'Identificar' },
          'eye',
        ),
      ];
  }
}

const hex = (color) => `#${Number(color).toString(16).padStart(6, '0')}`;

function detailRows(entry) {
  const rows = [deviceRow(entry)];
  rows[0] = { ...rows[0], label: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' } };
  const scene = entry.lastMode === LED_MODES.OFF ? null : sceneLabel(entry, entry.lastScene);
  if (scene) {
    rows.push({
      label: { en: 'Scene', fr: 'Scène', de: 'Szene', es: 'Escena' },
      icon: 'film',
      value: scene,
    });
  }
  if (entry.hasColor && entry.lastColor !== null && entry.lastColor !== undefined) {
    rows.push({
      label: { en: 'Color', fr: 'Couleur', de: 'Farbe', es: 'Color' },
      icon: 'droplet',
      value: hex(entry.lastColor),
    });
  }
  rows.push({
    label: { en: 'IP address', fr: 'Adresse IP', de: 'IP-Adresse', es: 'Dirección IP' },
    icon: 'wifi',
    value: entry.host,
  });
  rows.push({
    label: { en: 'LEDs', fr: 'LED', de: 'LEDs', es: 'LED' },
    icon: 'zap',
    value: entry.ledCount ?? 0,
  });
  if (entry.firmware) {
    rows.push({ label: sameText('Firmware'), icon: 'cpu', value: entry.firmware });
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
            de: 'Dieses Twinkly wurde noch nicht im Netzwerk gefunden.',
            es: 'Este Twinkly aún no se ha encontrado en la red.',
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
      label: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
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
        de: 'Keine feste Farbe auf diesem Twinkly (Firmware zu alt).',
        es: 'Este Twinkly no tiene color fijo (firmware demasiado antiguo).',
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
            de: 'Noch kein Twinkly gefunden. Öffnen Sie die Konfiguration der Integration, um eines hinzuzufügen.',
            es: 'Todavía no se ha encontrado ningún Twinkly. Abra la configuración de la integración para añadir uno.',
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
        label: { en: 'All on', fr: 'Tout allumer', de: 'Alle ein', es: 'Encender todo' },
        icon: 'sun',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.ALL_ON },
      },
      {
        type: 'button',
        label: { en: 'All off', fr: 'Tout éteindre', de: 'Alle aus', es: 'Apagar todo' },
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
      de: `${done} Twinkly erledigt, ${failed} ohne Antwort.`,
      es: `${done} Twinkly hecho(s), ${failed} sin respuesta.`,
    };
  }
  return on
    ? {
        en: `${done} Twinkly on.`,
        fr: `${done} Twinkly allumé(s).`,
        de: `${done} Twinkly eingeschaltet.`,
        es: `${done} Twinkly encendido(s).`,
      }
    : {
        en: `${done} Twinkly off.`,
        fr: `${done} Twinkly éteint(s).`,
        de: `${done} Twinkly ausgeschaltet.`,
        es: `${done} Twinkly apagado(s).`,
      };
}

const modeOfAction = (actionKey) =>
  MODE_BUTTONS.find((mode) => actionKey === `${MODE_ACTION_PREFIX}${mode}`) ?? null;

const presetOfAction = (actionKey) =>
  COLOR_PRESETS.find((p) => actionKey === `${COLOR_ACTION_PREFIX}${p.key}`) ?? null;

/**
 * The "Play…" form: the choice goes through the scene action paths (set_mode,
 * play_effect) or the scene feature path (a movie), then the brightness.
 */
async function runPlayAction(service, device, values) {
  // A core older than 5.2 drops the form and runs the action without
  // `values`: say so instead of playing something nobody chose.
  if (!values || typeof values !== 'object' || typeof values[PLAY_FIELDS.WHAT] !== 'string') {
    return {
      en: 'This button needs Gladys 5.2 or later. Use the mode buttons meanwhile.',
      fr: "Ce bouton demande Gladys 5.2 ou plus. Utilisez les boutons de mode d'ici là.",
      de: 'Diese Schaltfläche erfordert Gladys 5.2 oder neuer. Verwenden Sie bis dahin die Modus-Schaltflächen.',
      es: 'Este botón requiere Gladys 5.2 o posterior. Mientras tanto, utilice los botones de modo.',
    };
  }
  const what = values[PLAY_FIELDS.WHAT];
  const entry = service.entryByExternalId(device);
  const choice = entry ? playOptions(entry).find((option) => option.value === what) : null;
  let label;
  let playing = true;
  if (what.startsWith(PLAY_MODE_PREFIX)) {
    const applied = await service.applyMode(device, what.slice(PLAY_MODE_PREFIX.length));
    playing = applied !== LED_MODES.OFF;
    label = modeLabel(applied);
  } else if (what.startsWith('effect:')) {
    const number = await service.playEffect(device, Number(what.slice('effect:'.length)) + 1);
    label = effectLabel(number);
  } else {
    const scene = await service.playScene(device, what);
    label = choice?.label ?? sameText(scene.label);
  }
  const brightness = values[PLAY_FIELDS.BRIGHTNESS];
  // Raising the level of a Twinkly that is off turns it on: only a device
  // that plays something takes the brightness.
  if (playing && typeof brightness === 'number' && Number.isFinite(brightness)) {
    const level = await service.setBrightness(device, brightness);
    return {
      en: `Playing ${label.en} at ${level} %.`,
      fr: `Lecture : ${label.fr} à ${level} %.`,
      de: `Wiedergabe: ${label.de} bei ${level} %.`,
      es: `Reproduciendo: ${label.es} al ${level} %.`,
    };
  }
  return playingText(label);
}

/** The toast of a scene or mode that now plays. */
function playingText(label) {
  return {
    en: `Playing ${label.en}.`,
    fr: `Lecture : ${label.fr}.`,
    de: `Wiedergabe: ${label.de}.`,
    es: `Reproduciendo: ${label.es}.`,
  };
}

/** A button of a one-device card, on the device of the instance settings. */
async function runDeviceAction(service, actionKey, device, values) {
  if (!device) {
    throw new Error(`Widget action ${actionKey} needs a Twinkly in the widget settings`);
  }
  if (actionKey === WIDGET_ACTIONS.PLAY) {
    return runPlayAction(service, device, values);
  }
  const mode = modeOfAction(actionKey);
  if (mode) {
    const label = modeLabel(await service.applyMode(device, mode));
    return {
      en: `Mode: ${label.en}.`,
      fr: `Mode : ${label.fr}.`,
      de: `Modus: ${label.de}.`,
      es: `Modo: ${label.es}.`,
    };
  }
  const preset = presetOfAction(actionKey);
  if (preset) {
    await service.setColor(device, preset.color);
    return {
      en: `Color: ${preset.label.en}.`,
      fr: `Couleur : ${preset.label.fr}.`,
      de: `Farbe: ${preset.label.de}.`,
      es: `Color: ${preset.label.es}.`,
    };
  }
  switch (actionKey) {
    case WIDGET_ACTIONS.TURN_ON:
    case WIDGET_ACTIONS.TURN_OFF: {
      const on = actionKey === WIDGET_ACTIONS.TURN_ON;
      await service.applyMode(device, on ? 'on' : LED_MODES.OFF);
      return on
        ? {
            en: 'Twinkly on.',
            fr: 'Twinkly allumé.',
            de: 'Twinkly eingeschaltet.',
            es: 'Twinkly encendido.',
          }
        : {
            en: 'Twinkly off.',
            fr: 'Twinkly éteint.',
            de: 'Twinkly ausgeschaltet.',
            es: 'Twinkly apagado.',
          };
    }
    case WIDGET_ACTIONS.PREVIOUS_SCENE:
    case WIDGET_ACTIONS.NEXT_SCENE: {
      const scene = await service.stepScene(
        device,
        actionKey === WIDGET_ACTIONS.NEXT_SCENE ? 1 : -1,
      );
      const entry = service.entryByExternalId(device);
      const label = (entry && sceneLabel(entry, scene.value)) ?? sameText(scene.label);
      return playingText(label);
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
      return {
        en: `Brightness ${level} %.`,
        fr: `Luminosité ${level} %.`,
        de: `Helligkeit ${level} %.`,
        es: `Brillo ${level} %.`,
      };
    }
    default:
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
}

/**
 * A tapped button. Resolves the toast shown to the user.
 * @param {object} [values] the form of a button declaring `fields`, validated by the core
 */
export async function runOverviewAction(service, actionKey, settings = {}, values = undefined) {
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
  return runDeviceAction(service, actionKey, settings.device, values);
}

/** Widget handlers, keyed by the manifest `widgets` key. */
export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    get: (service, { settings } = {}) => buildOverview(service, settings ?? {}),
    action: (service, { actionKey, settings, values } = {}) =>
      runOverviewAction(service, actionKey, settings ?? {}, values),
  },
};

/** Ask the core to re-pull every widget now (fire-and-forget, rate-limited). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
