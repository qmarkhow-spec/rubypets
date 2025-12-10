import { DBClient, User } from "../db";
import { readJson } from "../api/utils";

export interface RegisterPayload {
  email: string;
  password: string;
  handle?: string;
  displayName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function parseRegisterPayload(request: Request): Promise<RegisterPayload> {
  return readJson<RegisterPayload>(request);
}

export async function parseLoginPayload(request: Request): Promise<LoginPayload> {
  return readJson<LoginPayload>(request);
}

export async function registerUser(db: DBClient, payload: RegisterPayload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const handle = (payload.handle ?? email.split("@")[0] ?? "user").trim();
  const displayName = (payload.displayName ?? handle).trim();

  if (!email || !password) {
    throw new Error("email and password are required");
  }
  if (!handle) {
    throw new Error("handle is required");
  }

  const existingEmail = await db.getUserByEmail(email);
  if (existingEmail) {
    throw new Error("email already registered");
  }
  const existingHandle = await db.getUserByHandle(handle);
  if (existingHandle) {
    throw new Error("handle already taken");
  }

  const passwordHash = await hashPassword(password);

  const user = await db.createUser({
    handle,
    displayName,
    email,
    passwordHash
  });

  const tokens = issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function loginUser(db: DBClient, payload: LoginPayload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) {
    throw new Error("email and password are required");
  }
  const user = await db.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new Error("invalid credentials");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("invalid credentials");

  const tokens = issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function getUserFromAuthHeader(db: DBClient, request: Request): Promise<User | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  const userId = parseUserIdFromToken(token);
  if (!userId) return null;
  return db.getUserById(userId);
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null
  };
}

export function issueTokens(userId: string) {
  return {
    accessToken: `uid:${userId}`,
    expiresIn: 60 * 60 * 24 * 30
  };
}

export function parseUserIdFromToken(token: string): string | null {
  if (!token.startsWith("uid:")) return null;
  return token.slice("uid:".length);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashHex = bufferToHex(digest);
  return `${salt}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest) === hashHex;
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
