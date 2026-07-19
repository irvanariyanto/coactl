import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const COOKIE = "coactl_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_LEN = 64;

export interface AuthFile {
  version: 1;
  enabled: boolean;
  /** scrypt salt (hex) */
  salt: string;
  /** scrypt-derived password hash (hex) — password is never stored in plaintext */
  hash: string;
  /** HMAC key for session cookies */
  sessionSecret: string;
}

export interface AuthStatus {
  enabled: boolean;
  unlocked: boolean;
  authFilePath: string;
}

export function authFilePath(): string {
  return process.env.COACTL_AUTH_FILE?.trim() || join(homedir(), ".coactl", "auth.json");
}

export function loadAuthFile(path = authFilePath()): AuthFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AuthFile>;
    if (
      raw.version !== 1 ||
      typeof raw.enabled !== "boolean" ||
      typeof raw.salt !== "string" ||
      typeof raw.hash !== "string" ||
      typeof raw.sessionSecret !== "string"
    ) {
      return null;
    }
    return raw as AuthFile;
  } catch {
    return null;
  }
}

function writeAuthFile(file: AuthFile, path = authFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore on unsupported platforms */
  }
}

export function hashPassword(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(password, salt, HASH_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export function verifyPassword(password: string, file: AuthFile): boolean {
  try {
    const { hash } = hashPassword(password, file.salt);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(file.hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function makeSessionToken(secret: string, now = Date.now()): string {
  const exp = now + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(c: Context, file: AuthFile | null): boolean {
  if (!file?.enabled) return true;
  const token = getCookie(c, COOKIE);
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload, file.sessionSecret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function cookieSecure(c: Context): boolean {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  return c.req.url.startsWith("https://");
}

export function setSessionCookie(c: Context, file: AuthFile): void {
  setCookie(c, COOKIE, makeSessionToken(file.sessionSecret), {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: cookieSecure(c),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export function getAuthStatus(c: Context): AuthStatus {
  const file = loadAuthFile();
  const enabled = Boolean(file?.enabled && file.hash && file.salt && file.sessionSecret);
  return {
    enabled,
    unlocked: !enabled || readSession(c, file),
    authFilePath: authFilePath(),
  };
}

export function enableAuth(password: string): AuthFile {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const existing = loadAuthFile();
  if (existing?.enabled) {
    throw new Error("Login is already enabled");
  }
  const { salt, hash } = hashPassword(password);
  const file: AuthFile = {
    version: 1,
    enabled: true,
    salt,
    hash,
    sessionSecret: randomBytes(32).toString("hex"),
  };
  writeAuthFile(file);
  return file;
}

export function disableAuth(): void {
  writeAuthFile({
    version: 1,
    enabled: false,
    salt: "",
    hash: "",
    sessionSecret: "",
  });
}

export function changePassword(current: string, next: string): AuthFile {
  const file = loadAuthFile();
  if (!file?.enabled) throw new Error("Login is not enabled");
  if (!verifyPassword(current, file)) throw new Error("Current password is incorrect");
  if (next.length < 8) throw new Error("Password must be at least 8 characters");
  const { salt, hash } = hashPassword(next);
  const updated: AuthFile = {
    ...file,
    salt,
    hash,
    sessionSecret: randomBytes(32).toString("hex"),
  };
  writeAuthFile(updated);
  return updated;
}

export function isPublicAuthPath(pathname: string, method: string): boolean {
  if (pathname === "/api/health" && method === "GET") return true;
  if (pathname === "/api/auth/status" && method === "GET") return true;
  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/auth/enable" && method === "POST") return true;
  return false;
}

/** Simple in-memory login throttle (per IP). */
const loginFails = new Map<string, { count: number; until: number }>();

export function assertLoginAllowed(ip: string): void {
  const row = loginFails.get(ip);
  if (!row) return;
  if (row.until > Date.now() && row.count >= 8) {
    throw new Error("Too many failed attempts. Try again in a few minutes.");
  }
  if (row.until <= Date.now()) loginFails.delete(ip);
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const row = loginFails.get(ip);
  if (!row || row.until <= now) {
    loginFails.set(ip, { count: 1, until: now + 15 * 60 * 1000 });
    return;
  }
  row.count += 1;
}

export function clearLoginFailures(ip: string): void {
  loginFails.delete(ip);
}
