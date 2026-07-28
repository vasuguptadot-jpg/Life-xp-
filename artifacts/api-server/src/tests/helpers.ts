import crypto from "node:crypto";
import request from "supertest";
import app from "../app";

/** Create a unique email for each test to avoid collisions */
export function uniqueEmail(): string {
  return `test-${crypto.randomBytes(8).toString("hex")}@lifexp-test.local`;
}

/** Create a unique username */
export function uniqueUsername(): string {
  return `u${crypto.randomBytes(6).toString("hex")}`;
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

/** Sign up and sign in a fresh test user, returning credentials */
export async function createTestUser(overrides?: {
  email?: string;
  username?: string;
  password?: string;
}): Promise<TestUser> {
  const email = overrides?.email ?? uniqueEmail();
  const username = overrides?.username ?? uniqueUsername();
  const password = overrides?.password ?? "TestPass123!";

  const signupRes = await request(app)
    .post("/api/auth/signup")
    .send({ email, username, password });

  if (signupRes.status !== 201) {
    throw new Error(
      `createTestUser: signup failed (${signupRes.status}): ${JSON.stringify(signupRes.body)}`,
    );
  }

  const signinRes = await request(app)
    .post("/api/auth/signin")
    .send({ email, password });

  if (signinRes.status !== 200) {
    throw new Error(
      `createTestUser: signin failed (${signinRes.status}): ${JSON.stringify(signinRes.body)}`,
    );
  }

  return {
    id: signinRes.body.user.id as string,
    email,
    username,
    accessToken: signinRes.body.accessToken as string,
    refreshToken: signinRes.body.refreshToken as string,
  };
}

export { app };
