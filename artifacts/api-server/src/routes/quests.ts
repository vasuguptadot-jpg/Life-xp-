import { Router } from "express";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { questTemplatesTable, userQuestsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

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

  const [updated] = await db
    .update(userQuestsTable)
    .set({
      progressValue: String(newProgress),
      status: newStatus,
      ...(newStatus === "COMPLETED" && { completedAt: new Date() }),
    })
    .where(eq(userQuestsTable.id, req.params.id))
    .returning();

  res.json(updated);
});

// POST /api/quests/:id/complete
router.post("/:id/complete", async (req, res) => {
  const userId = req.user!.sub;

  const [quest] = await db
    .select()
    .from(userQuestsTable)
    .where(and(eq(userQuestsTable.id, req.params.id), eq(userQuestsTable.userId, userId)))
    .limit(1);

  if (!quest) {
    res.status(404).json({ message: "Quest not found" });
    return;
  }
  if (quest.status === "COMPLETED") {
    res.json({ success: true, message: "Quest already completed", quest });
    return;
  }
  if (quest.status !== "ASSIGNED" && quest.status !== "IN_PROGRESS") {
    res.status(400).json({ message: "Quest cannot be completed in current state" });
    return;
  }

  const [updated] = await db
    .update(userQuestsTable)
    .set({ status: "COMPLETED", completedAt: new Date(), progressValue: quest.targetValue })
    .where(eq(userQuestsTable.id, req.params.id))
    .returning();

  res.json({ success: true, quest: updated, message: "Quest completed successfully" });
});

export default router;
