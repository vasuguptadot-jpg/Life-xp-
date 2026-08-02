import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiUserGoalsTable,
  aiDailyTasksTable,
  aiChatMessagesTable,
  aiDailyTipsTable,
  userLevelsTable,
  userAttributesTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { awardXp, isValidAttribute } from "../lib/progression";
import Groq from "groq-sdk";

const router = Router();
router.use(requireAuth);

const MODEL = "llama-3.3-70b-versatile";

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function getRankName(level: number) {
  if (level < 5) return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

async function getUserContext(userId: string) {
  const [goals, levelRows, attrs] = await Promise.all([
    db.select().from(aiUserGoalsTable).where(eq(aiUserGoalsTable.userId, userId)).limit(1),
    db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, userId)).limit(1),
    db.select().from(userAttributesTable).where(eq(userAttributesTable.userId, userId)),
  ]);

  const level = levelRows[0]?.currentLevel ?? 1;
  const totalXp = levelRows[0]?.totalXp ?? 0;
  const userGoals = goals[0]?.goals ?? "";
  const attrSummary =
    attrs.length > 0
      ? attrs.map((a) => `${a.attribute}: ${a.currentValue}`).join(", ")
      : "none trained yet";

  return { level, totalXp, userGoals, attrSummary, rank: getRankName(level) };
}

// ── GET /api/ai/goals ────────────────────────────────────────────────────────
router.get("/goals", async (req, res) => {
  const userId = req.user!.sub;
  const [row] = await db
    .select()
    .from(aiUserGoalsTable)
    .where(eq(aiUserGoalsTable.userId, userId))
    .limit(1);
  res.json({ goals: row?.goals ?? null, updatedAt: row?.updatedAt ?? null });
});

// ── POST /api/ai/goals ───────────────────────────────────────────────────────
router.post("/goals", async (req, res) => {
  const userId = req.user!.sub;
  const { goals } = req.body ?? {};
  if (!goals || typeof goals !== "string" || goals.trim().length < 5) {
    res.status(400).json({ message: "goals must be at least 5 characters" });
    return;
  }

  const [row] = await db
    .insert(aiUserGoalsTable)
    .values({ userId, goals: goals.trim() })
    .onConflictDoUpdate({
      target: [aiUserGoalsTable.userId],
      set: { goals: goals.trim(), updatedAt: new Date() },
    })
    .returning();

  // Invalidate cached tasks and tips so they regenerate with new goals
  await db
    .delete(aiDailyTasksTable)
    .where(
      and(eq(aiDailyTasksTable.userId, userId), eq(aiDailyTasksTable.date, todayStr())),
    );
  await db
    .delete(aiDailyTipsTable)
    .where(and(eq(aiDailyTipsTable.userId, userId), eq(aiDailyTipsTable.date, todayStr())));

  res.json(row);
});

// ── GET /api/ai/daily-tasks ──────────────────────────────────────────────────
router.get("/daily-tasks", async (req, res) => {
  const userId = req.user!.sub;
  const today = todayStr();

  const existing = await db
    .select()
    .from(aiDailyTasksTable)
    .where(and(eq(aiDailyTasksTable.userId, userId), eq(aiDailyTasksTable.date, today)));

  if (existing.length > 0) {
    res.json(existing);
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.json([]);
    return;
  }

  const ctx = await getUserContext(userId);

  const prompt = `You are a life coach for LifeXP, a gamified self-improvement app. Generate exactly 5 personalized daily tasks for today.

User context:
- Level: ${ctx.level} (${ctx.rank})
- Total XP: ${ctx.totalXp}
- Current attributes: ${ctx.attrSummary}
- User goals: ${ctx.userGoals || "No specific goals set — provide balanced tasks across all life areas"}

The 7 attributes are:
STRENGTH (gym/weights), ENDURANCE (cardio/running), MOBILITY (stretching/yoga/flexibility),
NUTRITION (diet/healthy eating/water), RECOVERY (sleep/rest/stress management),
DISCIPLINE (habits/consistency/productivity), KNOWLEDGE (reading/learning/studying)

Rules:
- Tasks must be specific and completable within one day
- Vary the categories based on the user's goals
- If user has no attributes trained yet, give introductory tasks
- Make tasks progressively appropriate for their level

Respond ONLY with a valid JSON array, nothing else. Example format:
[{"taskText":"Do 3 sets of 10 push-ups","category":"STRENGTH","xpReward":25},{"taskText":"Drink 8 glasses of water today","category":"NUTRITION","xpReward":20}]`;

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      res.json([]);
      return;
    }

    const tasks: Array<{ taskText: string; category: string; xpReward: number }> =
      JSON.parse(match[0]);

    const rows = await db
      .insert(aiDailyTasksTable)
      .values(
        tasks.slice(0, 5).map((t) => ({
          userId,
          date: today,
          taskText: String(t.taskText ?? "Complete a self-improvement activity").slice(0, 300),
          category: (String(t.category ?? "DISCIPLINE").toUpperCase().trim() as string),
          xpReward: Math.min(50, Math.max(10, Number(t.xpReward) || 25)),
        })),
      )
      .returning();

    res.json(rows);
  } catch {
    res.json([]);
  }
});

// ── POST /api/ai/daily-tasks/:id/complete ────────────────────────────────────
router.post("/daily-tasks/:id/complete", async (req, res) => {
  const userId = req.user!.sub;
  const { id } = req.params;

  const [task] = await db
    .select()
    .from(aiDailyTasksTable)
    .where(and(eq(aiDailyTasksTable.id, id), eq(aiDailyTasksTable.userId, userId)))
    .limit(1);

  if (!task) {
    res.status(404).json({ message: "Task not found" });
    return;
  }
  if (task.isCompleted) {
    res.json({ task, alreadyCompleted: true });
    return;
  }

  const [updated] = await db
    .update(aiDailyTasksTable)
    .set({ isCompleted: true, completedAt: new Date() })
    .where(
      and(
        eq(aiDailyTasksTable.id, id),
        eq(aiDailyTasksTable.userId, userId),
        eq(aiDailyTasksTable.isCompleted, false),
      ),
    )
    .returning();

  if (!updated) {
    res.json({ task, alreadyCompleted: true });
    return;
  }

  const cat = task.category.toUpperCase();
  const validAttr = isValidAttribute(cat) ? cat : null;

  const xpResult = await awardXp({
    userId,
    sourceType: "DAILY_TASK",
    sourceId: id,
    idempotencyKey: `daily_task_${id}`,
    xp: task.xpReward,
    category: "daily",
    description: task.taskText,
    ...(validAttr
      ? { attributes: [{ attribute: validAttr, xp: Math.floor(task.xpReward / 2) }] }
      : {}),
  });

  res.json({ task: updated, xp: xpResult });
});

// ── GET /api/ai/life-tip ─────────────────────────────────────────────────────
router.get("/life-tip", async (req, res) => {
  const userId = req.user!.sub;
  const today = todayStr();

  const [existing] = await db
    .select()
    .from(aiDailyTipsTable)
    .where(and(eq(aiDailyTipsTable.userId, userId), eq(aiDailyTipsTable.date, today)))
    .limit(1);

  if (existing) {
    res.json(existing);
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.json({
      tip: "Small consistent actions compound into extraordinary results. Pick one thing to improve today.",
      category: "DISCIPLINE",
      date: today,
    });
    return;
  }

  const ctx = await getUserContext(userId);

  const prompt = `Generate a single powerful, specific life tip for a LifeXP user:
- Level ${ctx.level} (${ctx.rank}), ${ctx.totalXp} total XP
- Attributes: ${ctx.attrSummary}
- Goals: ${ctx.userGoals || "general self-improvement"}

Requirements:
- Specific and actionable TODAY, not generic
- Backed by science or proven technique (briefly mention why it works)
- 2-3 sentences max
- Target the area most relevant to their goals or weakest attribute

Respond ONLY with JSON: {"tip": "...", "category": "ONE_OF_STRENGTH|ENDURANCE|MOBILITY|NUTRITION|RECOVERY|DISCIPLINE|KNOWLEDGE"}`;

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 250,
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match
      ? JSON.parse(match[0])
      : { tip: "Focus on one small improvement today.", category: "DISCIPLINE" };

    const [row] = await db
      .insert(aiDailyTipsTable)
      .values({
        userId,
        date: today,
        tip: String(parsed.tip || "Focus on one small improvement today.").slice(0, 500),
        category: (String(parsed.category || "DISCIPLINE").toUpperCase().trim()),
      })
      .returning();

    res.json(row);
  } catch {
    res.json({
      tip: "Small consistent actions compound into extraordinary results.",
      category: "DISCIPLINE",
      date: today,
    });
  }
});

// ── GET /api/ai/chat/history ─────────────────────────────────────────────────
router.get("/chat/history", async (req, res) => {
  const userId = req.user!.sub;
  const limit = Math.min(Number(req.query.limit) || 30, 50);

  const messages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.userId, userId))
    .orderBy(desc(aiChatMessagesTable.createdAt))
    .limit(limit);

  res.json(messages.reverse());
});

// ── POST /api/ai/chat ────────────────────────────────────────────────────────
router.post("/chat", async (req, res) => {
  const userId = req.user!.sub;
  const { message } = req.body ?? {};

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ message: "message is required" });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ message: "AI coach is not configured. Add GROQ_API_KEY to enable." });
    return;
  }

  const userMsg = message.trim().slice(0, 2000);

  const [ctx, recentHistory] = await Promise.all([
    getUserContext(userId),
    db
      .select()
      .from(aiChatMessagesTable)
      .where(eq(aiChatMessagesTable.userId, userId))
      .orderBy(desc(aiChatMessagesTable.createdAt))
      .limit(12),
  ]);

  const systemPrompt = `You are an elite AI life coach for LifeXP, a gamified self-improvement tracking app.

User profile:
- Level ${ctx.level} (${ctx.rank}), Total XP: ${ctx.totalXp}
- Attributes: ${ctx.attrSummary}
- Stated goals: ${ctx.userGoals || "not set yet — ask them about their goals early in the conversation"}

The 7 life attributes: STRENGTH (gym/weights), ENDURANCE (cardio), MOBILITY (flexibility), NUTRITION (diet), RECOVERY (sleep/rest), DISCIPLINE (habits), KNOWLEDGE (learning).

Your coaching style:
- Direct, data-driven, and specific. Reference their actual stats when relevant.
- Concise: max 3-4 sentences unless they ask for a detailed plan
- Give specific numbers, techniques, or approaches — not vague advice
- Celebrate progress and level-ups
- If goals aren't set, ask about them naturally in conversation
- Suggest specific quests or daily tasks when appropriate`;

  const historyMessages = recentHistory.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Save user message first
  await db.insert(aiChatMessagesTable).values({ userId, role: "user", content: userMsg });

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMsg },
      ],
      max_tokens: 600,
      temperature: 0.75,
    });

    const aiResponse =
      completion.choices[0]?.message?.content ??
      "I'm having a moment. Try again in a second!";

    const [savedMsg] = await db
      .insert(aiChatMessagesTable)
      .values({ userId, role: "assistant", content: aiResponse })
      .returning();

    res.json({ message: aiResponse, id: savedMsg.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ message: "AI coach is temporarily unavailable", error: msg });
  }
});

export default router;
