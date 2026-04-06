import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@atlas-kb/errors";
import type { AuthUser } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import { KNOWLEDGE_TABLES } from "./tables";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "atlas-kb-dev";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

type UserRow = {
  id: number | string;
  username: string;
  password: string;
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
    id: String(row.id),
    username: row.username,
  };
}

async function getUserRowById(userId: string): Promise<UserRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<UserRow[]>`
    SELECT id, username, password, created_at, updated_at
    FROM ${sql.unsafe(KNOWLEDGE_TABLES.users)}
    WHERE id = ${userId}
      AND username IS NOT NULL
    LIMIT 1
  `;

  return row ?? null;
}

async function getUserRowByUsername(username: string): Promise<UserRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<UserRow[]>`
    SELECT id, username, password, created_at, updated_at
    FROM ${sql.unsafe(KNOWLEDGE_TABLES.users)}
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

export async function requireDefaultUser(): Promise<AuthUser> {
  const existing = await getUserRowByUsername(getDefaultUsername());

  if (existing) {
    return toAuthUser(existing);
  }

  throw new NotFoundError(
    `Default knowledge user "${getDefaultUsername()}" not found`,
  );
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

  const user = {
    username,
    passwordHash: await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 12,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const [row] = await sql<UserRow[]>`
    INSERT INTO ${sql.unsafe(KNOWLEDGE_TABLES.users)} (name, username, email, password, created_at, updated_at)
    VALUES (
      ${user.username},
      ${user.username},
      ${null},
      ${user.passwordHash},
      ${user.createdAt},
      ${user.updatedAt}
    )
    ON CONFLICT (username) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      password = EXCLUDED.password,
      updated_at = EXCLUDED.updated_at
    RETURNING id, username, password, created_at, updated_at
  `;

  if (!row) {
    throw new ConflictError(`用户名 "${username}" 保存失败`);
  }

  return toAuthUser(row);
}

export async function authenticateUser(params: {
  username: string;
  password: string;
}): Promise<AuthUser | undefined> {
  const user = await getUserRowByUsername(params.username);

  if (!user) {
    return undefined;
  }

  const verified = await Bun.password.verify(params.password, user.password);

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
