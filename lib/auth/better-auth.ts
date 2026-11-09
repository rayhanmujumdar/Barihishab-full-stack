// better-auth: BariHisab's identity & credential engine (design D1).
//
// It owns how users/accounts are stored and how passwords are hashed and
// verified (Argon2id via our hooks). Its HTTP handler is deliberately NOT
// mounted — there is no /api/auth/[...all] route — so none of its public
// endpoints (sign-up, its own session cookies) are reachable. BariHisab issues
// its own JWT access + hashed rotating refresh tokens (lib/auth/tokens.ts),
// because better-auth sessions store raw tokens and never rotate.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins/username";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "./hash";
import { PASSWORD_MAX, PASSWORD_MIN } from "./password-policy";

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

export const auth = betterAuth({
  appName: "BariHisab",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // INV-01: invite-only
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(hash, password),
    },
  },
  session: { modelName: "baSession" },
  verification: { storeIdentifier: "hashed" },
  // Our own Postgres limiter guards /api/v1/auth/* (lib/auth/rate-limit.ts).
  rateLimit: { enabled: false },
  advanced: { database: { generateId: "uuid" } },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => USERNAME_PATTERN.test(value),
    }),
  ],
});

export type BetterAuth = typeof auth;
