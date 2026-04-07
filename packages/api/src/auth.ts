import { UnauthorizedError } from "@atlas-kb/errors";
import { authenticateUser, getAuthUserById } from "@atlas-kb/mastra/knowledge";
import {
  type LoginRequest,
  LoginRequestSchema,
  type LoginResult,
  type Session,
} from "@atlas-kb/schema";
import { SignJWT, jwtVerify } from "jose";

const DEFAULT_JWT_SECRET = "dev-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const JWT_ISSUER = "api";
const JWT_AUDIENCE = "web";

const encoder = new TextEncoder();

function getJwtSecret(): Uint8Array {
  return encoder.encode(
    process.env.ATLAS_KB_JWT_SECRET?.trim() || DEFAULT_JWT_SECRET,
  );
}

function resolveExpirationDate(): Date {
  return new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
}

function parseBearerToken(authorization?: string): string {
  const header = authorization?.trim();

  if (!header) {
    throw new UnauthorizedError("缺少认证信息");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match?.[1]) {
    throw new UnauthorizedError("认证头格式无效");
  }

  return match[1].trim();
}

export async function login(input: LoginRequest): Promise<LoginResult> {
  const parsedInput = LoginRequestSchema.parse(input);

  const user = await authenticateUser({
    username: parsedInput.username,
    password: parsedInput.password,
  });

  if (!user) {
    throw new UnauthorizedError("用户名或密码错误");
  }

  const expiresAt = resolveExpirationDate();
  const token = await new SignJWT({
    username: user.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return {
    token,
    user,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requireAuthenticatedSession(
  authorization?: string,
): Promise<Session> {
  const token = parseBearerToken(authorization);
  const verification = await jwtVerify(token, getJwtSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }).catch(() => {
    throw new UnauthorizedError("登录状态已失效，请重新登录");
  });

  const userId = verification.payload.sub?.trim();
  const expiresAt =
    typeof verification.payload.exp === "number"
      ? new Date(verification.payload.exp * 1000).toISOString()
      : undefined;

  if (!userId || !expiresAt) {
    throw new UnauthorizedError("登录凭证无效");
  }

  const user = await getAuthUserById(userId);

  if (!user) {
    throw new UnauthorizedError("当前用户不存在");
  }

  return {
    user,
    expiresAt,
  };
}
