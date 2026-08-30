import { pgTable, text, timestamp, uuid, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Conversations ────────────────────────────────────────────────────────────
// Raw SQL in artifacts/api-server/src/routes/messages.ts:
//   - INSERT INTO conversations DEFAULT VALUES RETURNING id
//   - SELECT c.id, c.created_at FROM conversations c ...
export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Conversation members ─────────────────────────────────────────────────────
// Raw SQL:
//   - INSERT INTO conversation_members (conversation_id, user_id) ...
//   - SELECT 1 FROM conversation_members WHERE conversation_id = ... AND user_id = ...
export const conversationMembersTable = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .references(() => conversationsTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("conversation_members_conversation_user_unique").on(t.conversationId, t.userId)],
);

// ── Messages ─────────────────────────────────────────────────────────────────
// Raw SQL:
//   - INSERT INTO messages (conversation_id, sender_id, content) ... RETURNING *
//   - SELECT m.id, m.content, m.created_at, m.sender_id ... FROM messages m ...
export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => conversationsTable.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_id_idx").on(t.conversationId)],
);

export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMember = typeof conversationMembersTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
