import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  uuid,
  json,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const onboardingStatesTable = pgTable("onboarding_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  currentStep: integer("current_step").default(1).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfilesTable = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  heightCm: integer("height_cm"),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
  activityLevel: text("activity_level"),
  dateOfBirth: timestamp("date_of_birth"),
  // Extended profile fields — written via raw SQL in routes/users.ts
  // (profile-extra), read by routes/social.ts (leaderboard avatar) and
  // routes/messages.ts (avatar on conversations).
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  age: integer("age"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const archetypesTable = pgTable("archetypes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").unique().notNull(),
  description: text("description").notNull(),
  focusAreas: json("focus_areas").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userCharactersTable = pgTable("user_characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  archetypeId: uuid("archetype_id")
    .references(() => archetypesTable.id)
    .notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userGoalsTable = pgTable(
  "user_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    goalKey: text("goal_key").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    // Free-text goal description — read by routes/social.ts
    // (personalized feed: SELECT g.text FROM user_goals ...).
    text: text("text"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("user_goals_user_id_idx").on(t.userId)],
);

export type OnboardingState = typeof onboardingStatesTable.$inferSelect;
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type Archetype = typeof archetypesTable.$inferSelect;
export type UserCharacter = typeof userCharactersTable.$inferSelect;
export type UserGoal = typeof userGoalsTable.$inferSelect;
