// Starts a fresh session (login, invite accept, reset) and attaches cookies.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";
import { appendAuthCookies } from "./cookies";
import { createSession, type SessionMeta } from "./session-service";
import { deriveCsrfToken, signAccessToken } from "./tokens";

export type IssuedTokens = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  remember: boolean;
};

type Db = Prisma.TransactionClient | typeof prisma;

export async function issueSession(
  db: Db,
  user: { id: string; tokenVersion: number; roles: Role[] },
  opts: { remember: boolean } & SessionMeta,
): Promise<IssuedTokens> {
  const { session, refreshToken } = await createSession({ userId: user.id, ...opts }, db);
  return issueAccessFor(user, session.id, refreshToken, opts.remember);
}

export async function issueAccessFor(
  user: { id: string; tokenVersion: number; roles: Role[] },
  sessionId: string,
  refreshToken: string,
  remember: boolean,
): Promise<IssuedTokens> {
  const accessToken = await signAccessToken({ sub: user.id, sid: sessionId, ver: user.tokenVersion, roles: user.roles });
  return { sessionId, accessToken, refreshToken, csrfToken: deriveCsrfToken(sessionId), remember };
}

export function withAuthCookies(res: Response, tokens: IssuedTokens): Response {
  appendAuthCookies(res.headers, tokens);
  return res;
}
