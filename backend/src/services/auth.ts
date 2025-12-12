import { DBClient, Owner } from "../db";
import { readJson } from "../api/utils";

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
  phoneNumber?: string;
  realName?: string;
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
  const displayName = (payload.displayName ?? email.split("@")[0] ?? "user").trim();
  const phoneNumber = (payload.phoneNumber ?? "").trim() || null;
  const realName = (payload.realName ?? displayName).trim();

  if (!email || !password) {
    throw new Error("email and password are required");
  }

  const existingEmail = await db.getOwnerByEmail(email);
  if (existingEmail) {
    throw new Error("email already registered");
  }

  const passwordHash = await hashPassword(password);
  const accountId = generateAccountId();
  const uuid = generateOwnerUuid();

  await db.createAccount({
    accountId,
    email,
    passwordHash,
    realName,
    phoneNumber: phoneNumber ?? undefined
  });

  const owner = await db.createOwner({
    accountId,
    uuid,
    displayName
  });

  const tokens = issueTokens(owner.uuid);
  return { owner: toPublicOwner(owner), tokens };
}

export async function loginUser(db: DBClient, payload: LoginPayload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) {
    throw new Error("email and password are required");
  }
  const owner = await db.getOwnerByEmail(email);
  if (!owner || !owner.passwordHash) {
    throw new Error("invalid credentials");
  }
  const ok = await verifyPassword(password, owner.passwordHash);
  if (!ok) throw new Error("invalid credentials");

  const tokens = issueTokens(owner.uuid);
  return { owner: toPublicOwner(owner), tokens };
}

export async function getUserFromAuthHeader(db: DBClient, request: Request): Promise<Owner | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  const ownerUuid = parseUserIdFromToken(token);
  if (!ownerUuid) return null;
  return db.getOwnerByUuid(ownerUuid);
}

export function toPublicOwner(owner: Owner) {
  const email = owner.email ?? "";
  return {
    id: owner.uuid,
    handle: owner.displayName || email.split("@")[0] || owner.uuid,
    displayName: owner.displayName,
    email: owner.email ?? null,
    avatarUrl: owner.avatarUrl ?? null,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive
  };
}

export function issueTokens(ownerUuid: string) {
  return {
    accessToken: `owner:${ownerUuid}`,
    expiresIn: 60 * 60 * 24 * 30
  };
}

export function parseUserIdFromToken(token: string): string | null {
  if (!token.startsWith("owner:")) return null;
  return token.slice("owner:".length);
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

function randomId(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function randomLowerId(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function generateAccountId() {
  return `acct_${randomLowerId(12)}`;
}

function generateOwnerUuid() {
  return `owner_${randomLowerId(8)}`;
}
