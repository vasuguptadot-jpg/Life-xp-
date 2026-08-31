import { Router } from "express";
import { requireAuth } from "../lib/auth";
import {
  buildAnalyticsState,
  loadActiveQuestTemplates,
  analyzeStreak,
  computeMomentum,
  detectWeaknesses,
  detectRecoveryMode,
  recommendDifficulty,
  recommendTasks,
  recommendQuests,
  rotateQuests,
  decomposeGoals,
  buildWeeklyReview,
  forecastNextMilestone,
  analyzeBehavior,
  composeDailyPlan,
} from "../lib/life-engine";

const router = Router();
router.use(requireAuth);

// GET /api/life-engine/streak
router.get("/streak", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(analyzeStreak(state));
});

// GET /api/life-engine/momentum
router.get("/momentum", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(computeMomentum(state));
});

// GET /api/life-engine/weaknesses
router.get("/weaknesses", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(detectWeaknesses(state));
});

// GET /api/life-engine/recovery
router.get("/recovery", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  const momentum = computeMomentum(state);
  res.json(detectRecoveryMode(state, momentum));
});

// GET /api/life-engine/difficulty
router.get("/difficulty", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(recommendDifficulty(state));
});

// GET /api/life-engine/recommendations
router.get("/recommendations", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  const templates = await loadActiveQuestTemplates();
  res.json({
    tasks: recommendTasks(state),
    quests: recommendQuests(state, templates),
  });
});

// GET /api/life-engine/quests/rotation
router.get("/quests/rotation", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  const templates = await loadActiveQuestTemplates();
  const count = Number(req.query.count) || 3;
  res.json(rotateQuests(state, templates, Math.min(10, Math.max(1, count))));
});

// GET /api/life-engine/goals
router.get("/goals", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(decomposeGoals(state));
});

// GET /api/life-engine/daily-plan
router.get("/daily-plan", async (req, res) => {
  res.json(await composeDailyPlan(req.user!.sub));
});

// GET /api/life-engine/weekly-review
router.get("/weekly-review", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  const momentum = computeMomentum(state);
  res.json(buildWeeklyReview(state, momentum));
});

// GET /api/life-engine/forecast
router.get("/forecast", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(forecastNextMilestone(state));
});

// GET /api/life-engine/behavior
router.get("/behavior", async (req, res) => {
  const state = await buildAnalyticsState(req.user!.sub);
  res.json(analyzeBehavior(state));
});

export default router;
