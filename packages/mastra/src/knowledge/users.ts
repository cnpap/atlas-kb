import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@atlas-kb/errors";
import type { AuthUser } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "atlas-kb-dev";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(input: string): string {
  const normalized = input.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new BadRequestError(
      "用户名仅支持字母、数字、点、下划线和中划线，长度 3 到 64 位",
    );
  }

  return normalized;
}

function toAuthUser(row: Pick<UserRow, "id" | "username">): AuthUser {
  return {
    id: row.id,
    username: row.username,
  };
}

async function getUserRowById(userId: string): Promise<UserRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<UserRow[]>`
    SELECT id, username, password_hash, created_at, updated_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return row ?? null;
}

async function getUserRowByUsername(username: string): Promise<UserRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<UserRow[]>`
    SELECT id, username, password_hash, created_at, updated_at
    FROM users
    WHERE username = ${normalizeUsername(username)}
    LIMIT 1
  `;

  return row ?? null;
}

export function getDefaultUsername(): string {
  return normalizeUsername(
    process.env.ATLAS_KB_DEFAULT_USERNAME?.trim() || DEFAULT_USERNAME,
  );
}

export function getDefaultPassword(): string {
  return process.env.ATLAS_KB_DEFAULT_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

export async function ensureDefaultUser(): Promise<AuthUser> {
  const existing = await getUserRowByUsername(getDefaultUsername());

  if (existing) {
    return toAuthUser(existing);
  }

  return createUser({
    username: getDefaultUsername(),
    password: getDefaultPassword(),
  });
}

export async function createUser(params: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const sql = await ensureKnowledgeDatabase();
  const username = normalizeUsername(params.username);
  const password = params.password.trim();

  if (!password) {
    throw new BadRequestError("密码不能为空");
  }

  const existing = await getUserRowByUsername(username);

  if (existing) {
    throw new ConflictError(`用户名 "${username}" 已存在`);
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await Bun.password.hash(password),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await sql`
    INSERT INTO users (id, username, password_hash, created_at, updated_at)
    VALUES (
      ${user.id},
      ${user.username},
      ${user.passwordHash},
      ${user.createdAt},
      ${user.updatedAt}
    )
  `;

  return {
    id: user.id,
    username: user.username,
  };
}

export async function authenticateUser(params: {
  username: string;
  password: string;
}): Promise<AuthUser | undefined> {
  const user = await getUserRowByUsername(params.username);

  if (!user) {
    return undefined;
  }

  const verified = await Bun.password.verify(
    params.password,
    user.password_hash,
  );

  return verified ? toAuthUser(user) : undefined;
}

export async function getAuthUserById(
  userId: string,
): Promise<AuthUser | undefined> {
  const row = await getUserRowById(userId);
  return row ? toAuthUser(row) : undefined;
}

export async function requireAuthUser(userId: string): Promise<AuthUser> {
  const user = await getAuthUserById(userId);

  if (!user) {
    throw new NotFoundError(`User "${userId}" not found`);
  }

  return user;
}
