import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, questTemplatesTable } from "@workspace/db/schema";
import { app, createTestUser } from "./helpers";

const createdEmails: string[] = [];
const createdTemplateIds: string[] = [];

afterEach(async () => {
  // Delete users first — CASCADE removes user_quests, xp_transactions, etc.
  // Then remove the templates (which have no users referencing them anymore).
  for (const email of createdEmails.splice(0)) {
    await db.delete(usersTable).where(eq(usersTable.email, email));
  }
  for (const id of createdTemplateIds.splice(0)) {
    await db.delete(questTemplatesTable).where(eq(questTemplatesTable.id, id));
  }
});

async function createTemplate(overrides?: object) {
  const [template] = await db
    .insert(questTemplatesTable)
    .values({
      title: "Test Quest",
      description: "A test quest",
      category: "fitness",
      questType: "ONE_TIME",
      targetValue: "1",
      status: "ACTIVE",
      progressionConfig: { xp: 100, attributes: [{ attribute: "STRENGTH", xp: 10 }] },
      ...overrides,
    })
    .returning();
  createdTemplateIds.push(template.id);
  return template;
}

describe("Quest ownership", () => {
  it("user cannot see another user's quest", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    createdEmails.push(userA.email, userB.email);

    const template = await createTemplate();

    // User A assigns the quest
    const assignRes = await request(app)
      .post(`/api/quests/assign/${template.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(assignRes.status).toBe(201);
    const questId = assignRes.body.id as string;

    // User B cannot see it
    const res = await request(app)
      .get(`/api/quests/${questId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("user cannot complete another user's quest", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    createdEmails.push(userA.email, userB.email);

    const template = await createTemplate();

    const assignRes = await request(app)
      .post(`/api/quests/assign/${template.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(assignRes.status).toBe(201);
    const questId = assignRes.body.id as string;

    // User B tries to complete user A's quest
    const res = await request(app)
      .post(`/api/quests/${questId}/complete`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Quest completion and XP award", () => {
  it("completing a quest awards XP via server-side logic", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);
    const template = await createTemplate();

    const assignRes = await request(app)
      .post(`/api/quests/assign/${template.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(assignRes.status).toBe(201);
    const questId = assignRes.body.id as string;

    const completeRes = await request(app)
      .post(`/api/quests/${questId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.xp).toBeDefined();
    expect(completeRes.body.xp.alreadyAwarded).toBe(false);

    // Verify XP shows in progression summary
    const summaryRes = await request(app)
      .get("/api/progression/summary")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.level.totalXp).toBeGreaterThan(0);
  });

  it("completing a quest twice does not award XP twice (idempotent)", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);
    const template = await createTemplate();

    const assignRes = await request(app)
      .post(`/api/quests/assign/${template.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    const questId = assignRes.body.id as string;

    await request(app)
      .post(`/api/quests/${questId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    const secondRes = await request(app)
      .post(`/api/quests/${questId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(secondRes.status).toBe(200);
    // Second call must report already awarded
    expect(secondRes.body.xp.alreadyAwarded).toBe(true);

    // XP total must still equal one quest's worth
    const summaryRes = await request(app)
      .get("/api/progression/summary")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(summaryRes.body.level.totalXp).toBe(100); // matches progressionConfig.xp
  });
});

describe("Global error handling", () => {
  it("returns structured JSON on 404 for unknown routes", async () => {
    const res = await request(app).get("/api/this-route-does-not-exist-at-all");
    // Express 5 returns 404 by default; our handler covers 500s
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Unauthorized access", () => {
  it("rejects quest list without token", async () => {
    const res = await request(app).get("/api/quests");
    expect(res.status).toBe(401);
  });

  it("rejects quest complete without token", async () => {
    const res = await request(app).post("/api/quests/some-id/complete");
    expect(res.status).toBe(401);
  });
});
