// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the surface the integration relies on and records every call
// so the tests can assert on it: externalIds, publishDiscoveredDevices,
// publishState(s), publishChangedStates (deduplicated like the SDK),
// forgetPublishedStates, publishTransports, setConnectionStatus, publishSceneEvent,
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
  const remembered = new Map();

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

    // Mirrors the SDK: only the values that changed since the last one Gladys
    // took, or older than the heartbeat; `forgetPublishedStates` resets that memory.
    async publishChangedStates(states, { heartbeat } = {}) {
      const now = Date.now();
      const changed = states.filter((s) => {
        const last = remembered.get(s.device_feature_external_id);
        return (
          last === undefined ||
          last.state !== s.state ||
          last.text !== s.text ||
          (heartbeat !== undefined && now - last.at >= heartbeat)
        );
      });
      for (const s of changed) {
        remembered.set(s.device_feature_external_id, { state: s.state, text: s.text, at: now });
      }
      if (changed.length > 0) {
        await this.publishStates(changed);
      }
      return { success: true, count: changed.length };
    },

    forgetPublishedStates(externalId) {
      for (const id of [...remembered.keys()]) {
        if (externalId === undefined || id === externalId || id.startsWith(`${externalId}:`)) {
          remembered.delete(id);
        }
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
