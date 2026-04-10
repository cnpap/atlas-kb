import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@atlas-kb/errors";
import type { AuthUser } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import { ensureDefaultKnowledgeCollection } from "./collections-repository";
import { nowIso, toDbUserId } from "./repository-shared";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "atlas-kb-dev";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

type UserRow = {
  created_at: Date | string | null;
  id: string;
  password: string;
  updated_at: Date | string | null;
  username: string | null;
};

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
  if (!row.username) {
    throw new NotFoundError(`User "${row.id}" has no username`);
  }

  return {
    id: row.id,
    username: row.username,
  };
}

async function getUserRowById(userId: string): Promise<UserRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("users")
      .select(["id", "username", "password", "created_at", "updated_at"])
      .where("id", "=", toDbUserId(userId))
      .where("username", "is not", null)
      .executeTakeFirst()) ?? null
  );
}

async function getUserRowByUsername(username: string): Promise<UserRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("users")
      .select(["id", "username", "password", "created_at", "updated_at"])
      .where("username", "=", normalizeUsername(username))
      .executeTakeFirst()) ?? null
  );
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
    const user = toAuthUser(existing);
    await ensureDefaultKnowledgeCollection(user.id);
    return user;
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
  const db = await ensureKnowledgeDatabase();
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

  const row = await db
    .insertInto("users")
    .values({
      name: user.username,
      username: user.username,
      email: null,
      password: user.passwordHash,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    })
    .onConflict((oc) =>
      oc.column("username").doUpdateSet({
        name: user.username,
        email: null,
        password: user.passwordHash,
        updated_at: user.updatedAt,
      }),
    )
    .returning(["id", "username", "password", "created_at", "updated_at"])
    .executeTakeFirst();

  if (!row) {
    throw new ConflictError(`用户名 "${username}" 保存失败`);
  }

  const authUser = toAuthUser(row);
  await ensureDefaultKnowledgeCollection(authUser.id);
  return authUser;
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
