/* Offline outbox: queue, TTL, dedupe and flush helpers.
   Messages themselves are the outbox (status === 'queued'), persisted in
   localStorage by the store. This adapter keeps transport concerns separate. */
export const OUTBOX_TTL = 24 * 60 * 60 * 1000;

export function isExpired(message) {
  return message.status === 'queued' && message.expiresAt && message.expiresAt < Date.now();
}

export function outboxOf(messages) {
  return messages.filter((m) => m.senderId === 'u_me' && m.status === 'queued');
}

export function dedupeById(list) {
  const seen = new Set();
  return list.filter((m) => {
    if (!m?.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function syncable(messages) {
  return outboxOf(messages).filter((m) => !isExpired(m));
}
