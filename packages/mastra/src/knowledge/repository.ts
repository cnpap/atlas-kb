import type { DashboardSummary } from "@atlas-kb/schema";
import { resetKnowledgeDatabase } from "./db";
import {
  createAssistantRole,
  deleteAssistantRole,
  ensureDefaultAssistantRole,
  getActiveAssistantRole,
  getActiveAssistantRolePromptConfig,
  listAssistantRoles,
  reorderAssistantRoles,
  setActiveAssistantRole,
  updateAssistantRole,
} from "./assistant-roles-repository";
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  getChatSessionById,
  listChatMessages,
  listChatSessions,
  requireChatSession,
  saveMessageFeedback,
  updateChatSession,
} from "./chat-repository";
import {
  createKnowledgeCollection,
  deleteKnowledgeCollection,
  getDashboardCounts,
  getKnowledgeCollection,
  listKnowledgeCollections,
  requireKnowledgeCollection,
  updateKnowledgeCollection,
} from "./collections-repository";
import {
  createKnowledgeSourceRecord,
  deleteKnowledgeSource,
  getKnowledgeCollectionSourcesData,
  getKnowledgeSourceById,
  listKnowledgeSources,
  replaceSourceContent,
  requireKnowledgeSource,
} from "./sources-repository";

export async function resetKnowledgeRepository(): Promise<void> {
  await resetKnowledgeDatabase();
  await ensureDefaultAssistantRole();
}

export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const [counts, recentCollections, recentSources, recentSessions] =
    await Promise.all([
      getDashboardCounts(userId),
      listKnowledgeCollections(userId).then((items) => items.slice(0, 6)),
      listKnowledgeSources(userId).then((items) => items.slice(0, 6)),
      listChatSessions(userId).then((items) => items.slice(0, 6)),
    ]);

  return {
    ...counts,
    recentCollections,
    recentSources,
    recentSessions,
    hasAnyData:
      recentCollections.length > 0 ||
      recentSources.length > 0 ||
      recentSessions.length > 0,
  };
}

export {
  appendChatMessage,
  createAssistantRole,
  createChatSession,
  createKnowledgeCollection,
  createKnowledgeSourceRecord,
  deleteAssistantRole,
  deleteChatSession,
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  getActiveAssistantRole,
  getActiveAssistantRolePromptConfig,
  getChatSessionById,
  getKnowledgeCollection,
  getKnowledgeCollectionSourcesData,
  getKnowledgeSourceById,
  listAssistantRoles,
  reorderAssistantRoles,
  listChatMessages,
  listChatSessions,
  listKnowledgeCollections,
  listKnowledgeSources,
  replaceSourceContent,
  requireChatSession,
  requireKnowledgeCollection,
  requireKnowledgeSource,
  saveMessageFeedback,
  setActiveAssistantRole,
  updateAssistantRole,
  updateChatSession,
  updateKnowledgeCollection,
};
