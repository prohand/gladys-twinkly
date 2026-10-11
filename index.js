// -----------------------------------------------------------------------------
// Entry point of the Twinkly integration for Gladys Assistant.
//
// SDK wiring only: every behaviour lives in src/twinkly/service.js. This file
//   1. instantiates the SDK (connection, auth, reconnection: handled by it);
//   2. registers the handlers BEFORE connect();
//   3. connects, finds the devices and publishes them.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR, injected by the Gladys supervisor.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { TwinklyService } from './src/twinkly/service.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './src/capabilities/widget.js';

const gladys = new GladysIntegration();
const service = new TwinklyService({ gladys });
service.onChange = () => refreshWidgets(gladys);

// --- Discovery: the user asks for a scan ------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> looking for Twinkly devices');
  await service.discover({ scan: true });
  await service.publishDevices();
  await service.publishTransports();
  await service.publishConnectionStatus();
  refreshWidgets(gladys);
});

// --- Commands and polling -----------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  // Throwing acks the command as failed: Gladys shows it.
  await service.setValue(device, feature, value);
});

gladys.onPoll((device) => service.poll(device));

// A device created after start-up: read it now rather than at the next poll.
gladys.onDeviceCreated((device) => service.poll(device));

// --- Configuration screen actions -------------------------------------------
gladys.onAction('test_connection', () => service.testConnection());
gladys.onAction('identify', (fields) => service.identify(fields.device));

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Triggers need no handler: the poll fires them (src/twinkly/service.js).
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(service, { fields }));
}

// --- Dashboard widget (Gladys 5.1+) -----------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, () => widget.get(service));
  gladys.onWidgetAction(key, (actionKey) => widget.action(service, { actionKey }));
}

// --- Configuration updated ----------------------------------------------------
gladys.onConfigUpdated(async (config) => {
  logger.info('onConfigUpdated -> new configuration received');
  service.setConfig(config);
  // New hosts, new refresh interval: find and re-publish (idempotent upsert).
  await service.discover();
  await service.publishDevices();
  await service.publishTransports();
  await service.publishConnectionStatus();
  refreshWidgets(gladys);
});

// --- Connection lifecycle -------------------------------------------------------
gladys.on('connected', async () => {
  try {
    service.setConfig(await gladys.getConfig());
    await service.discover();
    await service.publishDevices();
    await service.publishTransports();
    await service.publishConnectionStatus();
    // Nudges sent while the socket was down were dropped: re-sync dashboards.
    refreshWidgets(gladys);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// A failed promise somewhere must be logged, not kill the integration.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// --- Graceful shutdown ----------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup ----------------------------------------------------------------------
logger.info('Starting the Twinkly integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
