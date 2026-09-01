import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiUserGoalsTable,
  aiDailyTasksTable,
  aiChatMessagesTable,
  aiDailyTipsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { isValidUuid } from "../lib/uuid";
import { awardXpInTransaction, isValidAttribute } from "../lib/progression";
import {
  buildEngineState,
  buildAnalyticsState,
  countActiveQuests,
  countCompletedToday,
  detectIntent,
  buildIntentResponse,
  buildProgressResponse,
  buildDailyPlanResponse,
  buildWeeklyReviewResponse,
  buildWeaknessesResponse,
  buildRecommendationsResponse,
  buildGoalsResponse,
  buildMomentumResponse,
  computeMomentum,
  detectWeaknesses,
  recommendTasks,
  decomposeGoals,
  buildWeeklyReview,
  composeDailyPlan,
  generateDailyTasks,
  generateDailyTip,
} from "../lib/life-engine";
import Groq from "groq-sdk";
import { makeMutationLimiter } from "../lib/rate-limit";

const router = Router();
router.use(requireAuth);
// AG-2: bound daily-task completion attempts per authenticated user.
const completionLimiter = makeMutationLimiter();

const MODEL = "llama-3.3-70b-versatile";

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

/** Wrap an async op with a hard timeout so a hung provider cannot stall the endpoint. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI provider timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function attributeSummary(attributes: Record<string, number>): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return "none trained yet";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

/**
 * NON-AUTHORITATIVE optional enhancement: reword task text. Returns the
 * original text on any failure/timeout so the deterministic engine result is
 * never lost. Only affects presentation — never category, XP, or selection.
 */
async function enhanceTaskWording(texts: string[]): Promise<string[]> {
  if (!process.env.GROQ_API_KEY || texts.length === 0) return texts;
  try {
    const groq = getGroq();
    const prompt = `Rewrite each of the following daily task descriptions to be more engaging and specific. Keep the meaning and category identical, 12 words max each. Return ONLY a JSON array of strings in the same order.\n${JSON.stringify(texts)}`;
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
      8000,
    );
    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return texts;
    const arr: unknown = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length !== texts.length) return texts;
    return arr.map((s, i) =>
      typeof s === "string" && s.trim() ? s.trim().slice(0, 300) : texts[i],
    );
  } catch {
    return texts;
  }
}

/** NON-AUTHORITATIVE optional enhancement: reword a life tip. Falls back safely. */
async function enhanceTipWording(tip: string): Promise<string> {
  if (!process.env.GROQ_API_KEY || !tip) return tip;
  try {
    const groq = getGroq();
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `Rewrite this life tip to be more motivating and specific, 3 sentences max. Keep the advice identical:\n"${tip}"`,
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
      8000,
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    return raw.trim() ? raw.trim().slice(0, 500) : tip;
  } catch {
    return tip;
  }
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
// Deterministic Life Engine generates tasks; AI optionally rewords presentation.
router.get("/daily-tasks", async (req, res) => {
  const userId = req.user!.sub;
  try {
    const tasks = await generateDailyTasks(userId);
    if (tasks.length > 0 && process.env.GROQ_API_KEY) {
      const texts = await enhanceTaskWording(tasks.map((t) => t.taskText));
      res.json(tasks.map((t, i) => ({ ...t, taskText: texts[i] })));
      return;
    }
    res.json(tasks);
  } catch {
    res.json([]);
  }
});

// ── POST /api/ai/daily-tasks/:id/complete ────────────────────────────────────
router.post("/daily-tasks/:id/complete", completionLimiter, async (req, res) => {
  const userId = req.user!.sub;
  const { id } = req.params;
  if (!isValidUuid(id)) { res.status(400).json({ message: "Invalid task id" }); return; }

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

  const cat = task.category.toUpperCase();
  const validAttr = isValidAttribute(cat) ? cat : null;

  // Mark-complete + XP award are ATOMIC: a failure between them cannot leave a
  // task "completed but unrewarded" (or the reverse). The idempotency key still
  // makes concurrent/duplicate completions safe.
  const { updated, xpResult } = await db.transaction(async (tx) => {
    const [u] = await tx
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

    if (!u) {
      return { updated: null, xpResult: null };
    }

    const xp = await awardXpInTransaction(tx, {
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

    return { updated: u, xpResult: xp };
  });

  if (!updated) {
    res.json({ task, alreadyCompleted: true });
    return;
  }

  res.json({ task: updated, xp: xpResult });
});

// ── GET /api/ai/life-tip ─────────────────────────────────────────────────────
// Deterministic Life Tip Engine; AI optionally rewords presentation.
router.get("/life-tip", async (req, res) => {
  const userId = req.user!.sub;
  try {
    const tip = await generateDailyTip(userId);
    if (process.env.GROQ_API_KEY) {
      res.json({ ...tip, tip: await enhanceTipWording(tip.tip) });
      return;
    }
    res.json(tip);
  } catch {
    res.json({
      tip: "Small consistent actions compound into extraordinary results.",
      category: "DISCIPLINE",
      date: todayStr(),
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
// Deterministic intent layer answers common data questions without Groq;
// open-ended messages fall through to the AI-native coach.
router.post("/chat", async (req, res) => {
  const userId = req.user!.sub;
  const { message } = req.body ?? {};

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ message: "message is required" });
    return;
  }

  const userMsg = message.trim().slice(0, 2000);

  // ── Deterministic intent pre-processing (no AI) ──────────────────────────
  const intent = detectIntent(userMsg);
  if (intent) {
    const state = await buildEngineState(userId);
    const [activeQuests, completedToday] = await Promise.all([
      countActiveQuests(userId),
      countCompletedToday(userId),
    ]);
    const view = {
      level: state.level,
      totalXp: state.totalXp,
      rank: state.rank,
      streak: state.streak,
      activeQuests,
      completedToday,
    };

    let reply: string;
    switch (intent) {
      case "progress": {
        const as = await buildAnalyticsState(userId);
        reply = buildProgressResponse(view, computeMomentum(as));
        break;
      }
      case "daily_plan": {
        reply = buildDailyPlanResponse(await composeDailyPlan(userId));
        break;
      }
      case "weekly_review": {
        const as = await buildAnalyticsState(userId);
        reply = buildWeeklyReviewResponse(buildWeeklyReview(as, computeMomentum(as)));
        break;
      }
      case "weaknesses": {
        const as = await buildAnalyticsState(userId);
        reply = buildWeaknessesResponse(detectWeaknesses(as));
        break;
      }
      case "recommendations": {
        const as = await buildAnalyticsState(userId);
        reply = buildRecommendationsResponse(recommendTasks(as));
        break;
      }
      case "goals": {
        const as = await buildAnalyticsState(userId);
        reply = buildGoalsResponse(decomposeGoals(as));
        break;
      }
      case "momentum": {
        const as = await buildAnalyticsState(userId);
        reply = buildMomentumResponse(computeMomentum(as));
        break;
      }
      default:
        reply = buildIntentResponse(intent, view);
    }

    await db.insert(aiChatMessagesTable).values({ userId, role: "user", content: userMsg });
    const [savedMsg] = await db
      .insert(aiChatMessagesTable)
      .values({ userId, role: "assistant", content: reply })
      .returning();

    res.json({ message: reply, id: savedMsg.id });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ message: "AI coach is not configured. Add GROQ_API_KEY to enable." });
    return;
  }

  const [ctx, recentHistory] = await Promise.all([
    buildEngineState(userId),
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
- Attributes: ${attributeSummary(ctx.attributes)}
- Stated goals: ${ctx.goalsText || "not set yet — ask them about their goals early in the conversation"}

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
