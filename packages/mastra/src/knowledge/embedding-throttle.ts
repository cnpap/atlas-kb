import { sql } from "kysely";
import {
  getEmbeddingMaxConcurrency,
  getEmbeddingMinIntervalMs,
} from "./config";
import { ensureKnowledgeDatabase } from "./db";

const DEFAULT_EMBEDDING_THROTTLE_USER_KEY = "__atlas_kb_system__";
const EMBEDDING_THROTTLE_LEASE_TTL_MS = 15 * 60 * 1000;
const EMBEDDING_THROTTLE_BUSY_POLL_MS = 250;

type EmbeddingThrottleLease = {
  id: string;
  userKey: string;
};

type RateLimitStateRow = {
  next_start_at: Date | string;
};

type CountRow = {
  active_count: number | string;
};

function normalizeUserKey(userId?: string): string {
  return userId?.trim() || DEFAULT_EMBEDDING_THROTTLE_USER_KEY;
}

function toIsoDate(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function toWaitMs(nextStartAt: Date | string): number {
  return Math.max(0, new Date(nextStartAt).getTime() - Date.now());
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function tryAcquireEmbeddingThrottleLease(
  userKey: string,
): Promise<EmbeddingThrottleLease | { waitMs: number }> {
  const db = await ensureKnowledgeDatabase();

  return db.transaction().execute(async (trx) => {
    const now = toIsoDate();

    await sql`
      INSERT INTO kb_embedding_rate_limit_states (
        user_key,
        next_start_at,
        created_at,
        updated_at
      )
      VALUES (${userKey}, ${now}, ${now}, ${now})
      ON CONFLICT (user_key) DO NOTHING
    `.execute(trx);

    await sql`
      DELETE FROM kb_embedding_rate_limit_leases
      WHERE user_key = ${userKey}
        AND expires_at <= ${now}
    `.execute(trx);

    const stateRows = (
      await sql<RateLimitStateRow>`
        SELECT next_start_at
        FROM kb_embedding_rate_limit_states
        WHERE user_key = ${userKey}
        FOR UPDATE
      `.execute(trx)
    ).rows;
    const state = stateRows[0];

    if (!state) {
      return { waitMs: EMBEDDING_THROTTLE_BUSY_POLL_MS };
    }

    const activeRows = (
      await sql<CountRow>`
        SELECT count(*)::int AS active_count
        FROM kb_embedding_rate_limit_leases
        WHERE user_key = ${userKey}
          AND expires_at > ${now}
      `.execute(trx)
    ).rows;
    const activeCount = Number(activeRows[0]?.active_count ?? 0);
    const intervalWaitMs = toWaitMs(state.next_start_at);

    if (activeCount >= getEmbeddingMaxConcurrency() || intervalWaitMs > 0) {
      return {
        waitMs:
          activeCount >= getEmbeddingMaxConcurrency()
            ? Math.max(EMBEDDING_THROTTLE_BUSY_POLL_MS, intervalWaitMs)
            : intervalWaitMs,
      };
    }

    const leaseId = crypto.randomUUID();
    const nextStartAt = toIsoDate(getEmbeddingMinIntervalMs());
    const expiresAt = toIsoDate(EMBEDDING_THROTTLE_LEASE_TTL_MS);

    await sql`
      INSERT INTO kb_embedding_rate_limit_leases (
        id,
        user_key,
        started_at,
        expires_at,
        created_at
      )
      VALUES (${leaseId}, ${userKey}, ${now}, ${expiresAt}, ${now})
    `.execute(trx);

    await sql`
      UPDATE kb_embedding_rate_limit_states
      SET next_start_at = ${nextStartAt},
          updated_at = ${now}
      WHERE user_key = ${userKey}
    `.execute(trx);

    return {
      id: leaseId,
      userKey,
    };
  });
}

export async function acquireEmbeddingThrottleLease(
  userId?: string,
): Promise<EmbeddingThrottleLease> {
  const userKey = normalizeUserKey(userId);

  while (true) {
    const result = await tryAcquireEmbeddingThrottleLease(userKey);

    if ("id" in result) {
      return result;
    }

    await sleep(result.waitMs);
  }
}

export async function releaseEmbeddingThrottleLease(
  lease: EmbeddingThrottleLease,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await sql`
    DELETE FROM kb_embedding_rate_limit_leases
    WHERE id = ${lease.id}
      AND user_key = ${lease.userKey}
  `.execute(db);
}

export async function resetEmbeddingThrottleStateForTests(): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await sql`DELETE FROM kb_embedding_rate_limit_leases`.execute(db);
  await sql`DELETE FROM kb_embedding_rate_limit_states`.execute(db);
}
