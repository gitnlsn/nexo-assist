import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { User, UserRole } from "@/shared/domain";
import { getDb } from "./db/client";
import { usersTable } from "./db/schema";

/**
 * Minimal session auth for the challenge: corporate e-mail + any password (as the PRD asks),
 * then a signed, httpOnly JWT cookie. The user id in every request comes from this cookie only.
 */

const COOKIE = "nexo_session";
const MAX_AGE_S = 60 * 60 * 12;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (at least 16 characters).");
  return new TextEncoder().encode(s);
}

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Faça login para continuar." : "Acesso não permitido.");
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()));
  return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await getDb().select().from(usersTable).where(eq(usersTable.id, id));
  return row ?? null;
}

export async function startSession(user: User): Promise<void> {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ? await getUserById(payload.sub) : null;
  } catch {
    return null;
  }
}

export async function requireUser(role?: UserRole): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401);
  if (role && user.role !== role) throw new AuthError(403);
  return user;
}
