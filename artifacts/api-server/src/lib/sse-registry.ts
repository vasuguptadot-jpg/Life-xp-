/**
 * STAGE 22 — SSE connection registry with lifecycle observability.
 *
 * A single, observable registry for Server-Sent-Events client connections.
 * Every open/close is emitted as a structured log event so an operator can
 * detect connection leaks (clients that never disconnect) and correlate
 * realtime behaviour with the rest of the request lifecycle.
 *
 * The registry is deliberately tiny and bounded: entries are removed on the
 * request "close" event, and a conversation's entry is dropped when its last
 * client leaves. `getClientCount()` exists so tests can assert no leak.
 */
import { logger } from "./logger";

interface SseClient {
  userId: string;
  res: unknown;
}

const clientsByConversation = new Map<string, Set<SseClient>>();

/** Register a client and emit an open event. */
export function registerClient(conversationId: string, userId: string, res: unknown): void {
  if (!clientsByConversation.has(conversationId)) {
    clientsByConversation.set(conversationId, new Set());
  }
  clientsByConversation.get(conversationId)!.add({ userId, res });

  logger.info(
    {
      event: "sse.connection.opened",
      category: "realtime",
      conversationId,
      userId,
      totalClients: clientsByConversation.get(conversationId)!.size,
    },
    "SSE connection opened",
  );
}

/** Deregister a client and emit a close event. */
export function unregisterClient(conversationId: string, userId: string, res: unknown): void {
  const clients = clientsByConversation.get(conversationId);
  if (!clients) return;
  for (const client of clients) {
    if (client.userId === userId && client.res === res) {
      clients.delete(client);
      break;
    }
  }
  if (clients.size === 0) {
    clientsByConversation.delete(conversationId);
  }

  logger.info(
    {
      event: "sse.connection.closed",
      category: "realtime",
      conversationId,
      userId,
      remainingClients: clients.size,
    },
    "SSE connection closed",
  );
}

/** Broadcast a serialized event to every client in a conversation. */
export function broadcast(conversationId: string, event: object, senderUserId: string): void {
  const clients = clientsByConversation.get(conversationId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      (client.res as { write(data: string): unknown }).write(data);
    } catch {
      // Serialization/delivery failure — surface it so a dead socket is visible.
      logger.warn(
        {
          event: "sse.delivery.failed",
          category: "realtime",
          conversationId,
          userId: client.userId,
          senderUserId,
        },
        "SSE delivery failed",
      );
    }
  }
}

/** Total number of live SSE clients (across all conversations). */
export function getClientCount(): number {
  let total = 0;
  for (const set of clientsByConversation.values()) total += set.size;
  return total;
}

/** Number of conversations that currently have live clients. */
export function getConversationCount(): number {
  return clientsByConversation.size;
}
