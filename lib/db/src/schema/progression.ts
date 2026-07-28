import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ATTRIBUTES = [
  "STRENGTH",
  "ENDURANCE",
  "MOBILITY",
  "NUTRITION",
  "RECOVERY",
  "DISCIPLINE",
  "KNOWLEDGE",
] as const;

export type Attribute = (typeof ATTRIBUTES)[number];

export const xpTransactionsTable = pgTable("xp_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id)
    .notNull(),
  amount: integer("amount").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  idempotencyKey: text("idempotency_key").unique(),
  category: text("category"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userLevelsTable = pgTable("user_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id)
    .unique()
    .notNull(),
  currentLevel: integer("current_level").default(1).notNull(),
  totalXp: integer("total_xp").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userAttributesTable = pgTable(
  "user_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id)
      .notNull(),
    attribute: text("attribute").notNull(),
    currentValue: integer("current_value").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("user_attributes_user_attribute_unique").on(t.userId, t.attribute)],
);

export const attributeHistoryTable = pgTable("attribute_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id)
    .notNull(),
  attribute: text("attribute").notNull(),
  delta: integer("delta").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type XpTransaction = typeof xpTransactionsTable.$inferSelect;
export type UserLevel = typeof userLevelsTable.$inferSelect;
export type UserAttribute = typeof userAttributesTable.$inferSelect;
export type AttributeHistory = typeof attributeHistoryTable.$inferSelect;
