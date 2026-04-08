import type { KnowledgeCollection, KnowledgeSource } from "@atlas-kb/schema";

const DEMO_CREATED_AT = "2026-03-01T10:00:00.000Z";

export const DEMO_COLLECTIONS: KnowledgeCollection[] = [
  {
    id: "personal-notes",
    name: "个人笔记",
    description: "日常方法、流程卡片和参考资料。",
    color: "#0f766e",
    icon: "i-lucide-notebook-pen",
    isPinned: true,
    documentCount: 2,
    readyDocumentCount: 2,
    processingDocumentCount: 0,
    failedDocumentCount: 0,
    createdAt: DEMO_CREATED_AT,
    updatedAt: "2026-03-10T09:15:00.000Z",
    lastActivityAt: "2026-03-10T09:15:00.000Z",
  },
];

export const DEMO_SOURCES: KnowledgeSource[] = [
  {
    id: "onboarding-guide",
    collectionId: "personal-notes",
    title: "知识库启用清单",
    summary: "把新资料接入个人知识库时的推荐步骤。",
    content:
      "启动知识库时，先定义你最常问的 3 到 5 个问题，再导入首批核心资料，最后检查引用是否可靠。第一周应该完成最重要的一批资料导入，并用真实问题测试检索、引用和回答质量。如果有召回不准的情况，优先补充更直接的资料和更清晰的标题。",
    tags: ["知识库", "导入", "召回"],
    sourceType: "seed",
    status: "ready",
    createdAt: "2026-02-26T16:45:00.000Z",
    updatedAt: "2026-02-26T16:45:00.000Z",
  },
  {
    id: "citation-style-notes",
    collectionId: "personal-notes",
    title: "引用回答规则",
    summary: "回答时如何引用证据、如何处理证据不足。",
    content:
      "知识回答应该优先使用短片段，明确资料标题，并严格限制在召回到的上下文之内。如果召回证据很弱或根本没有命中，就应该直接说明证据不足，而不是继续编造内容。回答尽量简洁，但要让用户能迅速定位到对应资料。",
    tags: ["回答", "引用", "证据"],
    sourceType: "seed",
    status: "ready",
    createdAt: "2026-03-10T09:15:00.000Z",
    updatedAt: "2026-03-10T09:15:00.000Z",
  },
];
