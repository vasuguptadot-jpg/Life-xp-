import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  json,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const questTemplatesTable = pgTable("quest_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  instructions: text("instructions"),
  category: text("category").notNull(),
  questType: text("quest_type").notNull(),
  targetValue: numeric("target_value", { precision: 10, scale: 2 }),
  targetUnit: text("target_unit"),
  difficulty: text("difficulty").default("MEDIUM").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, ACTIVE, INACTIVE, ARCHIVED
  compatibleGoals: json("compatible_goals"),
  compatibleArchetypes: json("compatible_archetypes"),
  primaryAttributes: json("primary_attributes"),
  progressionConfig: json("progression_config").notNull().default({}),
  verificationRequirement: text("verification_requirement"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userQuestsTable = pgTable(
  "user_quests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id)
      .notNull(),
    questTemplateId: uuid("quest_template_id")
      .references(() => questTemplatesTable.id)
      .notNull(),
    status: text("status").default("ASSIGNED").notNull(), // ASSIGNED, IN_PROGRESS, COMPLETED, ABANDONED
    progressValue: numeric("progress_value", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    targetValue: numeric("target_value", { precision: 10, scale: 2 }).notNull(),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    completedAt: timestamp("completed_at"),
    completionSource: text("completion_source"),
    verificationStatus: text("verification_status").default("PENDING").notNull(),
  },
  (t) => [unique("user_quests_user_template_assigned_unique").on(t.userId, t.questTemplateId, t.assignedAt)],
);

export type QuestTemplate = typeof questTemplatesTable.$inferSelect;
export type UserQuest = typeof userQuestsTable.$inferSelect;
