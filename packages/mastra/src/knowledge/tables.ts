export const KNOWLEDGE_TABLES = {
  users: "users",
  assistantRoles: "kb_assistant_roles",
  userSettings: "kb_user_settings",
  collections: "kb_collections",
  sources: "kb_sources",
  importJobs: "kb_import_jobs",
  workspaceIndexCheckpoints: "kb_workspace_index_checkpoints",
  embeddingRateLimitStates: "kb_embedding_rate_limit_states",
  embeddingRateLimitLeases: "kb_embedding_rate_limit_leases",
  chatSessions: "kb_chat_sessions",
  chatMessages: "kb_chat_messages",
  chatFeedback: "kb_chat_feedback",
} as const;
