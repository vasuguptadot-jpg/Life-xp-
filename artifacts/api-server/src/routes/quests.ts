import { Router } from "express";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { questTemplatesTable, userQuestsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { awardXp, isValidAttribute, type AttributeAward } from "../lib/progression";
import { isValidUuid } from "../lib/uuid";

const router = Router();
router.use(requireAuth);

// GET /api/quests — user's current quests
router.get("/", async (req, res) => {
  const userId = req.user!.sub;
  const quests = await db
    .select()
    .from(userQuestsTable)
    .leftJoin(questTemplatesTable, eq(userQuestsTable.questTemplateId, questTemplatesTable.id))
    .where(eq(userQuestsTable.userId, userId))
    .orderBy(userQuestsTable.assignedAt);

  res.json(quests);
});

// GET /api/quests/catalogue — all active quest templates
router.get("/catalogue", async (_req, res) => {
  const templates = await db
    .select()
    .from(questTemplatesTable)
    .where(eq(questTemplatesTable.status, "ACTIVE"))
    .orderBy(questTemplatesTable.createdAt);

  res.json(templates);
});

// GET /api/quests/recommended — quests not yet active for user
router.get("/recommended", async (req, res) => {
  const userId = req.user!.sub;
  const limit = Number(req.query.limit) || 5;

  const active = await db
    .select({ questTemplateId: userQuestsTable.questTemplateId })
    .from(userQuestsTable)
    .where(
      and(
        eq(userQuestsTable.userId, userId),
        inArray(userQuestsTable.status, ["ASSIGNED", "IN_PROGRESS"]),
      ),
    );

  const activeIds = active.map((q) => q.questTemplateId);

  const query = db
    .select()
    .from(questTemplatesTable)
    .where(
      activeIds.length > 0
        ? and(
            eq(questTemplatesTable.status, "ACTIVE"),
            notInArray(questTemplatesTable.id, activeIds),
          )
        : eq(questTemplatesTable.status, "ACTIVE"),
    )
    .limit(limit);

  res.json(await query);
});

// POST /api/quests/assign/:templateId — assign a quest to user
router.post("/assign/:templateId", async (req, res) => {
  const userId = req.user!.sub;
  const { templateId } = req.params;

  const [template] = await db
    .select()
    .from(questTemplatesTable)
    .where(eq(questTemplatesTable.id, templateId))
    .limit(1);

  if (!template || template.status !== "ACTIVE") {
    res.status(400).json({ message: "Quest template not available" });
    return;
  }

  const [existing] = await db
    .select()
    .from(userQuestsTable)
    .where(
      and(
        eq(userQuestsTable.userId, userId),
        eq(userQuestsTable.questTemplateId, templateId),
        inArray(userQuestsTable.status, ["ASSIGNED", "IN_PROGRESS"]),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ message: "Quest already assigned" });
    return;
  }

  const [quest] = await db
    .insert(userQuestsTable)
    .values({
      userId,
      questTemplateId: templateId,
      targetValue: template.targetValue ?? "1",
      status: "ASSIGNED",
    })
    .returning();

  res.status(201).json({ ...quest, questTemplate: template });
});

// GET /api/quests/:id
router.get("/:id", async (req, res) => {
  const userId = req.user!.sub;
  if (!isValidUuid(req.params.id)) { res.status(400).json({ message: "Invalid quest id" }); return; }
  const [quest] = await db
    .select()
    .from(userQuestsTable)
    .leftJoin(questTemplatesTable, eq(userQuestsTable.questTemplateId, questTemplatesTable.id))
    .where(and(eq(userQuestsTable.id, req.params.id), eq(userQuestsTable.userId, userId)))
    .limit(1);

  if (!quest) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }
  res.json(quest);
});

// PATCH /api/quests/:id/progress
router.patch("/:id/progress", async (req, res) => {
  const userId = req.user!.sub;
  if (!isValidUuid(req.params.id)) { res.status(400).json({ message: "Invalid quest id" }); return; }
  const progress = Number(req.body?.progress);

  if (isNaN(progress) || progress < 0) {
    res.status(400).json({ message: "progress must be a non-negative number" });
    return;
  }

  const [quest] = await db
    .select()
    .from(userQuestsTable)
    .where(and(eq(userQuestsTable.id, req.params.id), eq(userQuestsTable.userId, userId)))
    .limit(1);

  if (!quest) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }
  if (quest.status !== "ASSIGNED" && quest.status !== "IN_PROGRESS") {
    res.status(400).json({ message: "Quest cannot be updated in current state" });
    return;
  }

  const target = Number(quest.targetValue);
  const newProgress = Math.min(progress, target);
  const newStatus = newProgress >= target ? "COMPLETED" : "IN_PROGRESS";

  // Re-assert ownership inside the UPDATE to prevent TOCTOU
  const [updated] = await db
    .update(userQuestsTable)
    .set({
      progressValue: String(newProgress),
      status: newStatus,
      ...(newStatus === "COMPLETED" && { completedAt: new Date() }),
    })
    .where(
      and(
        eq(userQuestsTable.id, req.params.id),
        eq(userQuestsTable.userId, userId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }

  res.json(updated);
});

// POST /api/quests/:id/abandon
router.post("/:id/abandon", async (req, res) => {
  const userId = req.user!.sub;
  const questId = req.params.id;
  if (!isValidUuid(questId)) { res.status(400).json({ message: "Invalid quest id" }); return; }

  const [quest] = await db
    .select()
    .from(userQuestsTable)
    .where(and(eq(userQuestsTable.id, questId), eq(userQuestsTable.userId, userId)))
    .limit(1);

  if (!quest) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }
  if (quest.status !== "ASSIGNED" && quest.status !== "IN_PROGRESS") {
    res.status(400).json({ message: "Only active quests can be abandoned" });
    return;
  }

  const [updated] = await db
    .update(userQuestsTable)
    .set({ status: "ABANDONED" })
    .where(
      and(
        eq(userQuestsTable.id, questId),
        eq(userQuestsTable.userId, userId),
        inArray(userQuestsTable.status, ["ASSIGNED", "IN_PROGRESS"]),
      ),
    )
    .returning();

  if (!updated) {
    res.status(409).json({ message: "Quest state changed concurrently" });
    return;
  }

  res.json({ success: true, quest: updated });
});

// POST /api/quests/:id/complete
router.post("/:id/complete", async (req, res) => {
  const userId = req.user!.sub;
  const questId = req.params.id;
  if (!isValidUuid(questId)) { res.status(400).json({ message: "Invalid quest id" }); return; }

  // Step 1: Verify ownership
  const [quest] = await db
    .select()
    .from(userQuestsTable)
    .where(and(eq(userQuestsTable.id, questId), eq(userQuestsTable.userId, userId)))
    .limit(1);

  if (!quest) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }
  if (
    quest.status !== "ASSIGNED" &&
    quest.status !== "IN_PROGRESS" &&
    quest.status !== "COMPLETED"
  ) {
    res.status(400).json({ message: "Quest cannot be completed in current state" });
    return;
  }

  // Step 2: Fetch template for XP config
  const [template] = await db
    .select()
    .from(questTemplatesTable)
    .where(eq(questTemplatesTable.id, quest.questTemplateId))
    .limit(1);

  // Step 3: Mark COMPLETED atomically — re-assert ownership + valid status in UPDATE
  let completedQuest = quest;
  if (quest.status !== "COMPLETED") {
    const [updated] = await db
      .update(userQuestsTable)
      .set({ status: "COMPLETED", completedAt: new Date(), progressValue: quest.targetValue })
      .where(
        and(
          eq(userQuestsTable.id, questId),
          eq(userQuestsTable.userId, userId),
          inArray(userQuestsTable.status, ["ASSIGNED", "IN_PROGRESS"]),
        ),
      )
      .returning();

    if (!updated) {
      // Another request may have completed it concurrently — re-fetch to confirm
      const [refetched] = await db
        .select()
        .from(userQuestsTable)
        .where(and(eq(userQuestsTable.id, questId), eq(userQuestsTable.userId, userId)))
        .limit(1);
      if (!refetched || refetched.status !== "COMPLETED") {
        res.status(409).json({ message: "Quest state changed concurrently" });
        return;
      }
      completedQuest = refetched;
    } else {
      completedQuest = updated;
    }
  }

  // Step 4: Award XP via server-side progression service (idempotent by questId)
  const progressionConfig = (template?.progressionConfig ?? {}) as {
    xp?: number;
    attributes?: Array<{ attribute: string; xp: number }>;
  };

  const xpReward = progressionConfig.xp ?? 50;
  const validAttributes: AttributeAward[] = (progressionConfig.attributes ?? []).filter(
    (a): a is AttributeAward => isValidAttribute(a.attribute) && a.xp > 0,
  );

  const xpResult = await awardXp({
    userId,
    sourceType: "QUEST_COMPLETION",
    sourceId: questId,
    idempotencyKey: `quest_complete_${questId}`,
    xp: xpReward,
    category: "quest",
    description: template ? `Completed quest: ${template.title}` : "Completed quest",
    attributes: validAttributes,
  });

  res.json({
    success: true,
    quest: completedQuest,
    xp: xpResult,
    message: xpResult.alreadyAwarded ? "Quest already rewarded" : "Quest completed successfully",
  });
});

export default router;
