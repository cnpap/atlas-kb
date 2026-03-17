import type { KnowledgeDocument, KnowledgeSpace } from "@atlas-kb/schema";

export const SEED_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "ops-oncall-playbook",
    spaceId: "ops",
    title: "On-Call Playbook",
    summary:
      "Escalation, triage, and incident communication for production alerts.",
    excerpt:
      "Start with service impact, assign an incident commander, and post a status update within 10 minutes.",
    content:
      "The on-call playbook defines how Atlas teams respond to production alerts. Start by confirming customer impact, assign an incident commander, and post a status update within 10 minutes. Capture mitigations, owners, and next updates until the incident is resolved. After recovery, publish a short retrospective with timelines and follow-up actions.",
    tags: ["operations", "incident", "oncall"],
    source: "seed",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "ops-release-checklist",
    spaceId: "ops",
    title: "Release Checklist",
    summary: "Preflight checks for safe production releases.",
    excerpt:
      "Validate migrations in staging, confirm rollback steps, and monitor the first 15 minutes after deploy.",
    content:
      "Before every production release, validate database migrations in staging, confirm rollback steps, verify feature flags, and notify the support channel. After deployment, monitor latency, error rate, and queue depth during the first 15 minutes. Any regression above threshold triggers an immediate rollback decision.",
    tags: ["operations", "release", "deployment"],
    source: "seed",
    createdAt: "2026-03-05T08:30:00.000Z",
    updatedAt: "2026-03-05T08:30:00.000Z",
  },
  {
    id: "product-customer-onboarding",
    spaceId: "product",
    title: "Customer Onboarding Guide",
    summary: "Recommended steps for onboarding new workspace admins.",
    excerpt:
      "Schedule a kickoff, import the first knowledge set, and train one champion user before go-live.",
    content:
      "Customer onboarding starts with a kickoff call, a workspace setup review, and an agreed success metric. The first knowledge set should be imported during the first week. Before go-live, train one champion user on search, citations, and answer review so they can support the rest of the team.",
    tags: ["product", "onboarding", "customer"],
    source: "seed",
    createdAt: "2026-02-26T16:45:00.000Z",
    updatedAt: "2026-02-26T16:45:00.000Z",
  },
  {
    id: "product-citation-style",
    spaceId: "product",
    title: "Citation Style Notes",
    summary:
      "How answers should present supporting evidence from knowledge documents.",
    excerpt:
      "Prefer short quotations, cite titles, and never invent facts beyond the retrieved context.",
    content:
      "Knowledge answers should use short quotations or snippets, cite the source document title, and stay within the retrieved context. If retrieval is weak or missing, the assistant should say so directly instead of inventing unsupported details. Favor concise answers with explicit source references.",
    tags: ["product", "qa", "citations"],
    source: "seed",
    createdAt: "2026-03-10T09:15:00.000Z",
    updatedAt: "2026-03-10T09:15:00.000Z",
  },
];

export const SEED_SPACES: KnowledgeSpace[] = [
  {
    id: "ops",
    name: "Ops Handbook",
    description: "Runbooks, release checks, and incident operations guidance.",
    documentCount: SEED_DOCUMENTS.filter(
      (document) => document.spaceId === "ops",
    ).length,
    updatedAt: "2026-03-05T08:30:00.000Z",
  },
  {
    id: "product",
    name: "Product Enablement",
    description: "Customer onboarding and answer quality guidance.",
    documentCount: SEED_DOCUMENTS.filter(
      (document) => document.spaceId === "product",
    ).length,
    updatedAt: "2026-03-10T09:15:00.000Z",
  },
];

export function listKnowledgeSpaces(): KnowledgeSpace[] {
  return SEED_SPACES.map((space) => ({ ...space }));
}

export function getKnowledgeSpace(spaceId: string): KnowledgeSpace | undefined {
  const space = SEED_SPACES.find((item) => item.id === spaceId);
  return space ? { ...space } : undefined;
}

export function listKnowledgeDocuments(spaceId?: string): KnowledgeDocument[] {
  return SEED_DOCUMENTS.filter((document) =>
    spaceId ? document.spaceId === spaceId : true,
  ).map((document) => ({
    ...document,
    tags: [...document.tags],
  }));
}
