import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import onboardingRouter from "./onboarding";
import progressionRouter from "./progression";
import questsRouter from "./quests";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/onboarding", onboardingRouter);
router.use("/progression", progressionRouter);
router.use("/quests", questsRouter);

export default router;
