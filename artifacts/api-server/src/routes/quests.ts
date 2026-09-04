import { Router } from "express";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { questTemplatesTable, userQuestsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { awardXpInTransaction, isValidAttribute, type AttributeAward } from "../lib/progression";
import { isValidUuid } from "../lib/uuid";
import { parseLimit } from "../lib/pagination";
import { makeMutationLimiter } from "../lib/rate-limit";

const router = Router();
router.use(requireAuth);
// AG-2: bound the number of quest mutation attempts per authenticated user.
// Applied per-route so read-only endpoints are never throttled.
const mutationLimiter = makeMutationLimiter();

// Sentinel thrown inside the completion transaction to signal a concurrent
// state change; caught by the handler and mapped to a 409.
class QuestConcurrentError extends Error {}

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
  const limit = parseLimit(req.query.limit, 5, 20);

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
router.post("/assign/:templateId", mutationLimiter, async (req, res) => {
  const userId = req.user!.sub;
  const { templateId } = req.params;
  if (!isValidUuid(templateId)) { res.status(400).json({ message: "Invalid quest template id" }); return; }

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

  // Repeatability control (AG-1): a quest template is a one-time mission. Once
  // a user has COMPLETED it (the terminal state that awards XP), they may not
  // re-assign the same template — otherwise assign→complete→re-assign becomes
  // an unbounded XP-farming loop. Abandoning remains a legitimate retry path.
  const [completed] = await db
    .select({ id: userQuestsTable.id })
    .from(userQuestsTable)
    .where(
      and(
        eq(userQuestsTable.userId, userId),
        eq(userQuestsTable.questTemplateId, templateId),
        eq(userQuestsTable.status, "COMPLETED"),
      ),
    )
    .limit(1);

  if (completed) {
    res.status(409).json({ message: "Quest already completed — this quest cannot be repeated" });
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
router.patch("/:id/progress", mutationLimiter, async (req, res) => {
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
  // Completion — and its XP award — is exclusively the job of POST /:id/complete.
  // Advancing progress here must NEVER transition a quest to COMPLETED, otherwise
  // a client (or a lost response between the progress write and the follow-up
  // complete call) could leave a quest in the terminal "rewarded" state with its
  // reward silently missing — a "quest complete but XP missing" integrity hole.
  const newStatus = "IN_PROGRESS";

  // Re-assert ownership inside the UPDATE to prevent TOCTOU
  const [updated] = await db
    .update(userQuestsTable)
    .set({
      progressValue: String(newProgress),
      status: newStatus,
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
router.post("/:id/abandon", mutationLimiter, async (req, res) => {
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
router.post("/:id/complete", mutationLimiter, async (req, res) => {
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

  // Steps 3+4 run in a SINGLE transaction so that "quest marked COMPLETED" and
  // "XP awarded" are atomic: a failure (DB loss, timeout, crash) rolls both
  // back together — the system can never end up with a completed quest that
  // silently lost its reward. The template-scoped idempotency key still makes
  // replays safe.
  const progressionConfig = (template?.progressionConfig ?? {}) as {
    xp?: number;
    attributes?: Array<{ attribute: string; xp: number }>;
  };
  const xpReward = progressionConfig.xp ?? 50;
  const validAttributes: AttributeAward[] = (progressionConfig.attributes ?? []).filter(
    (a): a is AttributeAward => isValidAttribute(a.attribute) && a.xp > 0,
  );

  let completedQuest;
  let xpResult;
  try {
    const result = await db.transaction(async (tx) => {
    // Step 3: Mark COMPLETED atomically — re-assert ownership + valid status in UPDATE
    let current = quest;
    if (quest.status !== "COMPLETED") {
      const [updated] = await tx
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
        const [refetched] = await tx
          .select()
          .from(userQuestsTable)
          .where(and(eq(userQuestsTable.id, questId), eq(userQuestsTable.userId, userId)))
          .limit(1);
        if (!refetched || refetched.status !== "COMPLETED") {
          throw new QuestConcurrentError();
        }
        current = refetched;
      } else {
        current = updated;
      }
    }

    // Step 4: Award XP within the same transaction (idempotent by template)
    const xp = await awardXpInTransaction(tx, {
      userId,
      sourceType: "QUEST_COMPLETION",
      sourceId: questId,
      // Template-scoped idempotency (AG-1 defense-in-depth): even if a race
      // produced two instances of the same template, the user can only ever be
      // rewarded once per template. Globally unique per (user, template).
      idempotencyKey: `quest_complete_${userId}_${quest.questTemplateId}`,
      xp: xpReward,
      category: "quest",
      description: template ? `Completed quest: ${template.title}` : "Completed quest",
      attributes: validAttributes,
    });

      return { completedQuest: current, xpResult: xp };
    });
    completedQuest = result.completedQuest;
    xpResult = result.xpResult;
  } catch (err) {
    if (err instanceof QuestConcurrentError) {
      res.status(409).json({ message: "Quest state changed concurrently" });
      return;
    }
    throw err;
  }

  res.json({
    success: true,
    quest: completedQuest,
    xp: xpResult,
    message: xpResult.alreadyAwarded ? "Quest already rewarded" : "Quest completed successfully",
  });
});

export default router;
