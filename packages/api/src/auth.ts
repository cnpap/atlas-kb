import { UnauthorizedError } from "@atlas-kb/errors";
import {
  type AuthUser,
  type LoginRequest,
  LoginRequestSchema,
  type LoginResult,
  type Session,
} from "@atlas-kb/schema";
import { SignJWT, jwtVerify } from "jose";

const DEFAULT_ADMIN_EMAIL = "admin@atlas-kb.local";
const DEFAULT_ADMIN_PASSWORD = "atlas-kb-dev";
const DEFAULT_JWT_SECRET = "atlas-kb-dev-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const JWT_ISSUER = "atlas-kb/api";
const JWT_AUDIENCE = "atlas-kb/web";

const encoder = new TextEncoder();

function getAdminEmail(): string {
  return process.env.ATLAS_KB_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
}

function getAdminPassword(): string {
  return process.env.ATLAS_KB_ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
}

function getJwtSecret(): Uint8Array {
  return encoder.encode(
    process.env.ATLAS_KB_JWT_SECRET?.trim() || DEFAULT_JWT_SECRET,
  );
}

function createAuthUser(): AuthUser {
  return {
    email: getAdminEmail(),
    role: "admin",
  };
}

function resolveExpirationDate(): Date {
  return new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
}

function parseBearerToken(authorization?: string): string {
  const header = authorization?.trim();

  if (!header) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match?.[1]) {
    throw new UnauthorizedError("Invalid Authorization header");
  }

  return match[1].trim();
}

export async function login(input: LoginRequest): Promise<LoginResult> {
  const parsedInput = LoginRequestSchema.parse(input);
  const adminEmail = getAdminEmail();
  const adminPassword = getAdminPassword();

  if (
    parsedInput.email.trim().toLowerCase() !== adminEmail.toLowerCase() ||
    parsedInput.password !== adminPassword
  ) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const user = createAuthUser();
  const expiresAt = resolveExpirationDate();
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.email)
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
    throw new UnauthorizedError("Invalid or expired token");
  });

  const email = verification.payload.sub?.trim();
  const role = verification.payload.role;
  const expiresAt =
    typeof verification.payload.exp === "number"
      ? new Date(verification.payload.exp * 1000).toISOString()
      : undefined;

  if (!email || role !== "admin" || !expiresAt) {
    throw new UnauthorizedError("Invalid token payload");
  }

  return {
    user: {
      email,
      role: "admin",
    },
    expiresAt,
  };
}
