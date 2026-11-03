import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { parse } from "cookie";
import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { AURA_SESSION_COOKIE } from "@shared/const";
import { getDb } from "../db";
import { sessions, users, type User } from "../../drizzle/schema";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function deriveKey(password: string, salt: Buffer, N: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 16_384);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltHex || !hashHex) return false;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (n !== 16_384 || r !== 8 || p !== 1 || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"), n);
  return timingSafeEqual(actual, expected);
}

function requestHeader(req: Request, name: string) {
  const expressGet = (req as Request & { get?: (header: string) => string | undefined }).get;
  if (expressGet) return expressGet.call(req, name);
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isLocalRequest(req: Request) {
  const forwardedHost = requestHeader(req, "x-forwarded-host")?.split(",")[0].trim();
  const host = (forwardedHost || requestHeader(req, "host") || "").toLowerCase().replace(/^\[|\]$/g, "").split(":")[0];
  const origin = requestHeader(req, "origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.protocol === "https:" && !localHosts.has(originUrl.hostname)) return false;
    } catch {
      return false;
    }
  }
  return localHosts.has(host);
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const local = isLocalRequest(req);
  res.cookie(AURA_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !local,
    sameSite: local ? "lax" : "none",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  const local = isLocalRequest(req);
  res.clearCookie(AURA_SESSION_COOKIE, {
    httpOnly: true,
    secure: !local,
    sameSite: local ? "lax" : "none",
    path: "/",
    maxAge: -1,
  });
}

function tokenFromRequest(req: Request) {
  const raw = req.headers.cookie ? parse(req.headers.cookie)[AURA_SESSION_COOKIE] : undefined;
  return raw && /^[A-Za-z0-9_-]{40,64}$/.test(raw) ? raw : null;
}

export function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, req: Request, res: Response) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: sessionTokenHash(token), userId, expiresAt });
  setSessionCookie(req, res, token);
}

export async function destroySession(req: Request) {
  const token = tokenFromRequest(req);
  if (!token) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sessionTokenHash(token)));
}

export async function authenticateApplicationRequest(req: Request): Promise<User | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const [record] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sessionTokenHash(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return record?.user ?? null;
}

export function safeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 20_000) {
    for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
    while (buckets.size > 15_000) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait and try again." });
  }
}
