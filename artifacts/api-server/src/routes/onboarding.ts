import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  onboardingStatesTable,
  userProfilesTable,
  archetypesTable,
  userCharactersTable,
  userGoalsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

async function getOrCreateOnboardingState(userId: string) {
  const [existing] = await db
    .select()
    .from(onboardingStatesTable)
    .where(eq(onboardingStatesTable.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(onboardingStatesTable)
    .values({ userId, currentStep: 1, isCompleted: false })
    .returning();
  return created;
}

// GET /api/onboarding
router.get("/", async (req, res) => {
  const userId = req.user!.sub;
  const [state, profile, character, goals] = await Promise.all([
    getOrCreateOnboardingState(userId),
    db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId)).limit(1),
    db
      .select()
      .from(userCharactersTable)
      .leftJoin(archetypesTable, eq(userCharactersTable.archetypeId, archetypesTable.id))
      .where(eq(userCharactersTable.userId, userId))
      .limit(1),
    db.select().from(userGoalsTable).where(eq(userGoalsTable.userId, userId)),
  ]);

  res.json({
    state,
    profile: profile[0] ?? null,
    character: character[0] ?? null,
    goals,
  });
});

// PATCH /api/onboarding/step
router.patch("/step", async (req, res) => {
  const userId = req.user!.sub;
  const { currentStep, isCompleted } = req.body ?? {};

  await getOrCreateOnboardingState(userId);

  const [updated] = await db
    .update(onboardingStatesTable)
    .set({
      ...(currentStep !== undefined && { currentStep }),
      ...(isCompleted !== undefined && { isCompleted }),
      ...(isCompleted && { completedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(onboardingStatesTable.userId, userId))
    .returning();

  res.json(updated);
});

// PATCH /api/onboarding/profile
router.patch("/profile", async (req, res) => {
  const userId = req.user!.sub;
  const { heightCm, weightKg, activityLevel, dateOfBirth } = req.body ?? {};

  const updateSet = {
    ...(heightCm !== undefined && { heightCm }),
    ...(weightKg !== undefined && { weightKg: String(weightKg) }),
    ...(activityLevel !== undefined && { activityLevel }),
    ...(dateOfBirth !== undefined && { dateOfBirth: new Date(dateOfBirth) }),
    updatedAt: new Date(),
  };

  const [profile] = await db
    .insert(userProfilesTable)
    .values({ userId, ...updateSet })
    .onConflictDoUpdate({ target: userProfilesTable.userId, set: updateSet })
    .returning();

  res.json(profile);
});

// POST /api/onboarding/goals
router.post("/goals", async (req, res) => {
  const userId = req.user!.sub;
  const { goals, primaryGoal } = req.body ?? {};

  if (!Array.isArray(goals) || goals.length === 0) {
    res.status(400).json({ message: "goals must be a non-empty array" });
    return;
  }

  await db.delete(userGoalsTable).where(eq(userGoalsTable.userId, userId));

  await db.insert(userGoalsTable).values(
    goals.map((goalKey: string) => ({
      userId,
      goalKey,
      isPrimary: goalKey === primaryGoal,
    })),
  );

  res.json({ success: true });
});

// GET /api/onboarding/archetypes
router.get("/archetypes", async (_req, res) => {
  const archetypes = await db.select().from(archetypesTable);
  res.json(archetypes);
});

// POST /api/onboarding/archetype
router.post("/archetype", async (req, res) => {
  const userId = req.user!.sub;
  const { archetypeId } = req.body ?? {};

  if (!archetypeId) {
    res.status(400).json({ message: "archetypeId is required" });
    return;
  }

  const [archetype] = await db
    .select()
    .from(archetypesTable)
    .where(eq(archetypesTable.id, archetypeId))
    .limit(1);

  if (!archetype) {
    res.status(400).json({ message: "Invalid archetype" });
    return;
  }

  const [character] = await db
    .insert(userCharactersTable)
    .values({ userId, archetypeId })
    .onConflictDoUpdate({
      target: userCharactersTable.userId,
      set: { archetypeId, updatedAt: new Date() },
    })
    .returning();

  res.json(character);
});

// POST /api/onboarding/complete
router.post("/complete", async (req, res) => {
  const userId = req.user!.sub;
  await getOrCreateOnboardingState(userId);

  const [state] = await db
    .update(onboardingStatesTable)
    .set({ isCompleted: true, completedAt: new Date(), currentStep: 7, updatedAt: new Date() })
    .where(eq(onboardingStatesTable.userId, userId))
    .returning();

  res.json(state);
});

export default router;
