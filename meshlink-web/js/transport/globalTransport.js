/* Global transport adapter: WebSocket relay events. */
import { sendRemote, onRemote, initRealtime, realtimeConnected } from '../realtime.js';

export const globalTransport = {
  id: 'global',
  label: 'Global cloud relay (WSS)',
  init: initRealtime,
  send: (event) => sendRemote({ ...event, transport: 'global' }),
  onEvent: onRemote,
  connected: realtimeConnected,
};
