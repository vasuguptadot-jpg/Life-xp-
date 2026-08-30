import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth, verifyToken } from "../lib/auth";

const router = Router();
// requireAuth for all routes except the SSE events route, which authenticates
// via ?token= (EventSource cannot set the Authorization header) and enforces
// conversation membership in its own handler.
router.use((req, res, next) => {
  if (req.method === "GET" && req.path.endsWith("/events")) {
    return next();
  }
  requireAuth(req, res, next);
});

// UUID v4-ish format check used to reject malformed ids cleanly (400) rather
// than letting PostgreSQL raise a cast error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory SSE clients map: conversationId -> Set of {userId, res}
const sseClients = new Map<string, Set<{ userId: string; res: any }>>();

function broadcastToConversation(conversationId: string, event: object, senderUserId: string) {
  const clients = sseClients.get(conversationId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    // Send to all clients in the conversation (including sender for confirmation)
    try { client.res.write(data); } catch {}
  }
}

// GET /api/messages/conversations
router.get("/conversations", async (req, res) => {
  const userId = req.user!.sub;
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.created_at,
      -- other member
      u.id as other_user_id,
      u.username as other_username,
      u.display_name as other_display_name,
      up.avatar_url as other_avatar_url,
      -- last message
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ${userId}) as unread_count
    FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ${userId}
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id != ${userId}
    JOIN users u ON u.id = cm2.user_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
  `);
  res.json(rows.rows ?? rows);
});

// POST /api/messages/conversations  { otherUserId }
router.post("/conversations", async (req, res) => {
  const userId = req.user!.sub;
  const { otherUserId } = req.body ?? {};
  if (!otherUserId || otherUserId === userId) {
    res.status(400).json({ message: "Invalid user" }); return;
  }
  if (typeof otherUserId !== "string" || !UUID_RE.test(otherUserId)) {
    res.status(400).json({ message: "Invalid user" }); return;
  }

  // Ensure the other user actually exists before inserting members, otherwise
  // the FK constraint aborts the insert and surfaces as an unhandled 500.
  const target = await db.execute(sql`SELECT 1 FROM users WHERE id = ${otherUserId} LIMIT 1`);
  if (((target.rows ?? target) as any[]).length === 0) {
    res.status(404).json({ message: "User not found" }); return;
  }

  // Check if conversation already exists
  const existing = await db.execute(sql`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ${userId}
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ${otherUserId}
    LIMIT 1
  `);
  const existingRows = (existing.rows ?? existing) as any[];
  if (existingRows.length > 0) {
    res.json({ id: existingRows[0].id, existing: true }); return;
  }

  // Create new conversation
  const result = await db.execute(sql`
    WITH new_conv AS (
      INSERT INTO conversations DEFAULT VALUES RETURNING id
    )
    INSERT INTO conversation_members (conversation_id, user_id)
    SELECT id, unnest(ARRAY[${userId}::uuid, ${otherUserId}::uuid]) FROM new_conv
    RETURNING conversation_id as id
  `);
  const rows = (result.rows ?? result) as any[];
  res.status(201).json({ id: rows[0].id, existing: false });
});

// GET /api/messages/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res) => {
  const userId = req.user!.sub;
  const convId = req.params.id;
  if (!UUID_RE.test(convId)) { res.status(400).json({ message: "Invalid conversation id" }); return; }

  // Verify membership
  const member = (await db.execute(sql`
    SELECT 1 FROM conversation_members WHERE conversation_id = ${convId} AND user_id = ${userId}
  `)).rows[0];
  if (!member) { res.status(403).json({ message: "Not a member" }); return; }

  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const before = req.query.before as string | undefined;

  const rows = await db.execute(sql`
    SELECT m.id, m.content, m.created_at, m.sender_id,
           u.username as sender_username, u.display_name as sender_display_name,
           up.avatar_url as sender_avatar_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN user_profiles up ON up.user_id = m.sender_id
    WHERE m.conversation_id = ${convId}
    ${before ? sql`AND m.created_at < ${before}` : sql``}
    ORDER BY m.created_at ASC
    LIMIT ${limit}
  `);
  res.json(rows.rows ?? rows);
});

// POST /api/messages/conversations/:id/messages
router.post("/conversations/:id/messages", async (req, res) => {
  const userId = req.user!.sub;
  const convId = req.params.id;
  if (!UUID_RE.test(convId)) { res.status(400).json({ message: "Invalid conversation id" }); return; }
  const { content } = req.body ?? {};
  if (!content?.trim()) { res.status(400).json({ message: "Content required" }); return; }

  // Verify membership
  const members = await db.execute(sql`
    SELECT user_id FROM conversation_members WHERE conversation_id = ${convId}
  `);
  const memberRows = (members.rows ?? members) as any[];
  if (!memberRows.some((m: any) => m.user_id === userId)) {
    res.status(403).json({ message: "Not a member" }); return;
  }

  // Insert message
  const result = await db.execute(sql`
    INSERT INTO messages (conversation_id, sender_id, content)
    VALUES (${convId}, ${userId}, ${content.trim()})
    RETURNING *
  `);
  const msg = ((result.rows ?? result) as any[])[0];

  // Get sender info
  const senderInfo = (await db.execute(sql`
    SELECT u.username, u.display_name, up.avatar_url
    FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.id = ${userId}
  `)).rows[0];

  const fullMsg = {
    ...msg,
    sender_username: (senderInfo as any).username,
    sender_display_name: (senderInfo as any).display_name,
    sender_avatar_url: (senderInfo as any).avatar_url,
  };

  // Broadcast via SSE to all members
  broadcastToConversation(convId, { type: "message", message: fullMsg }, userId);

  res.status(201).json(fullMsg);
});

// GET /api/messages/conversations/:id/events  (SSE — auth via Bearer or ?token=)
router.get("/conversations/:id/events", async (req, res) => {
  // EventSource can't set headers, so also accept token via query param
  const tokenFromQuery = req.query.token as string | undefined;
  if (tokenFromQuery && !req.user) {
    try {
      req.user = verifyToken(tokenFromQuery);
    } catch {
      res.status(401).json({ message: "Unauthorized" }); return;
    }
  }
  if (!req.user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const userId = req.user!.sub;
  const convId = req.params.id;
  if (!UUID_RE.test(convId)) { res.status(400).json({ message: "Invalid conversation id" }); return; }

  // Verify membership
  const member = (await db.execute(sql`
    SELECT 1 FROM conversation_members WHERE conversation_id = ${convId} AND user_id = ${userId}
  `)).rows[0];
  if (!member) { res.status(403).json({ message: "Not a member" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = { userId, res };
  if (!sseClients.has(convId)) sseClients.set(convId, new Set());
  sseClients.get(convId)!.add(client);

  // Heartbeat every 25s
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(convId)?.delete(client);
    if (sseClients.get(convId)?.size === 0) sseClients.delete(convId);
  });
});

export default router;
