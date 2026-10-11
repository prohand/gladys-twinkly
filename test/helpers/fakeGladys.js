// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the surface the integration relies on and records every call
// so the tests can assert on it: externalIds, publishDiscoveredDevices,
// publishState(s), publishTransports, setConnectionStatus, publishSceneEvent,
// requestWidgetRefresh and scanNetwork (answering what `scanReplies` holds).
// No running Gladys, no WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys({ devices = [], scanReplies = [], scanError = null } = {}) {
  const published = [];
  const discovered = [];
  const transports = [];
  const connectionStatuses = [];
  const sceneEvents = [];
  const widgetRefreshes = [];
  const scans = [];

  return {
    devices,
    published,
    discovered,
    transports,
    connectionStatuses,
    sceneEvents,
    widgetRefreshes,
    scans,

    externalIds(type, platformId) {
      const device = `${type}:${platformId}`;
      return { device, feature: (key) => `${device}:${key}` };
    },

    async publishDiscoveredDevices(list) {
      discovered.push(list);
      return { success: true };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({
          featureExternalId: s.device_feature_external_id,
          state: s.text !== undefined ? s.text : s.state,
        });
      }
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    async publishSceneEvent(key, data = {}) {
      sceneEvents.push({ key, data });
      return { success: true };
    },

    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
    },

    async scanNetwork(type, options) {
      scans.push({ type, options });
      if (scanError) {
        throw scanError;
      }
      return scanReplies;
    },

    /** States published for one feature, in order. */
    statesOf(featureExternalId) {
      return published
        .filter((entry) => entry.featureExternalId === featureExternalId)
        .map((entry) => entry.state);
    },
  };
}
