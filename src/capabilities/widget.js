// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+): every Twinkly at a glance.
//
// One status row per device (what it plays and how bright, or "unreachable"),
// and two buttons a light switch cannot give: everything on, everything off.
// The content is declarative, the core renders it (see the "Dashboard widgets"
// section of the SDK README): at most 10 status rows and 4 buttons.
//
// The key is stored by the dashboards users build: never rename it.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LED_MODES } from '../twinkly/client.js';
import { modeLabel } from '../twinkly/labels.js';

const logger = createLogger({ name: 'widget' });

/** Key of the manifest widget. */
export const OVERVIEW_WIDGET = 'twinkly_overview';

/** Keys of the widget buttons. */
export const WIDGET_ACTIONS = { ALL_ON: 'all_on', ALL_OFF: 'all_off' };

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

/**
 * The widget content.
 * @param {import('../twinkly/service.js').TwinklyService} service
 */
export function buildOverview(service) {
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

/** A tapped button. Resolves the toast shown to the user. */
export async function runOverviewAction(service, actionKey) {
  logger.info(`Widget action ${actionKey}`);
  if (actionKey !== WIDGET_ACTIONS.ALL_ON && actionKey !== WIDGET_ACTIONS.ALL_OFF) {
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  const { done, failed } = await service.switchAll(actionKey === WIDGET_ACTIONS.ALL_ON);
  if (failed > 0) {
    return {
      en: `${done} Twinkly done, ${failed} did not answer.`,
      fr: `${done} Twinkly fait(s), ${failed} sans réponse.`,
    };
  }
  return actionKey === WIDGET_ACTIONS.ALL_ON
    ? { en: `${done} Twinkly on.`, fr: `${done} Twinkly allumé(s).` }
    : { en: `${done} Twinkly off.`, fr: `${done} Twinkly éteint(s).` };
}

/** Widget handlers, keyed by the manifest `widgets` key. */
export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    get: (service) => buildOverview(service),
    action: (service, { actionKey }) => runOverviewAction(service, actionKey),
  },
};

/** Ask the core to re-pull every widget now (fire-and-forget, rate-limited). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
