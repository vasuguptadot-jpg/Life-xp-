import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const xpTransactionsTable = pgTable(
  "xp_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    amount: integer("amount").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key").unique(),
    category: text("category"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("xp_transactions_user_id_idx").on(t.userId),
    // STAGE 25 — authoritative XP invariant: a transaction amount must never
    // be negative. The application sanitizes (only awards xp > 0), but the
    // database is the final authority — this CHECK makes a negative insert
    // impossible for the application role. Zero is permitted (a zero-value
    // transaction cannot corrupt the SUM).
    check("xp_transactions_amount_nonnegative", sql`${t.amount} >= 0`),
  ],
);

export const userLevelsTable = pgTable(
  "user_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .unique()
      .notNull(),
    currentLevel: integer("current_level").default(1).notNull(),
    totalXp: integer("total_xp").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // STAGE 25 — total XP is a monotonic aggregate of the XP ledger; a
    // negative total would corrupt level derivation (sqrt(total/100)+1).
    check("user_levels_total_xp_nonnegative", sql`${t.totalXp} >= 0`),
    check("user_levels_current_level_positive", sql`${t.currentLevel} >= 1`),
  ],
);

export const userAttributesTable = pgTable(
  "user_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    attribute: text("attribute").notNull(),
    currentValue: integer("current_value").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("user_attributes_user_attribute_unique").on(t.userId, t.attribute),
    // STAGE 25 — attribute XP is monotonic (the application only awards
    // positive deltas); a negative current value would break monotonicity.
    check("user_attributes_current_value_nonnegative", sql`${t.currentValue} >= 0`),
  ],
);

export const attributeHistoryTable = pgTable(
  "attribute_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    attribute: text("attribute").notNull(),
    delta: integer("delta").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("attribute_history_user_id_idx").on(t.userId),
    // Ensures a given (sourceId, attribute) pair is only awarded once.
    // NULLs are exempt from this constraint (NULL != NULL in SQL).
    unique("attribute_history_source_attr_unique").on(t.sourceId, t.attribute),
    // STAGE 25 — history records only positive awards; a negative delta would
    // silently decrement the corresponding attribute if replayed.
    check("attribute_history_delta_nonnegative", sql`${t.delta} >= 0`),
  ],
);

export type XpTransaction = typeof xpTransactionsTable.$inferSelect;
export type UserLevel = typeof userLevelsTable.$inferSelect;
export type UserAttribute = typeof userAttributesTable.$inferSelect;
export type AttributeHistory = typeof attributeHistoryTable.$inferSelect;
