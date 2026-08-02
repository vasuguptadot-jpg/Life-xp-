import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// User's stated goals for the AI coach
export const aiUserGoalsTable = pgTable("ai_user_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  goals: text("goals").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI-generated daily tasks (5 per day, per user)
export const aiDailyTasksTable = pgTable(
  "ai_daily_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    taskText: text("task_text").notNull(),
    category: text("category").notNull(),
    xpReward: integer("xp_reward").notNull().default(25),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_daily_tasks_user_date_idx").on(t.userId, t.date)],
);

// AI coach chat messages
export const aiChatMessagesTable = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_chat_messages_user_idx").on(t.userId)],
);

// Daily AI-generated life tips (cached per user per day)
export const aiDailyTipsTable = pgTable(
  "ai_daily_tips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    tip: text("tip").notNull(),
    category: text("category").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_daily_tips_user_date_idx").on(t.userId, t.date)],
);

export type AiUserGoal = typeof aiUserGoalsTable.$inferSelect;
export type AiDailyTask = typeof aiDailyTasksTable.$inferSelect;
export type AiChatMessage = typeof aiChatMessagesTable.$inferSelect;
export type AiDailyTip = typeof aiDailyTipsTable.$inferSelect;
