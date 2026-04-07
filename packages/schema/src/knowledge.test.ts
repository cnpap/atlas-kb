import { describe, expect, it } from "bun:test";
import { success } from "./api";
import {
  ChatReplyResponseSchema,
  ChatReplyStreamDataEventSchema,
  KnowledgeBatchImportResponseSchema,
  KnowledgeCollectionsResponseSchema,
  KnowledgeImportResponseSchema,
  SearchKnowledgeRequestSchema,
} from "./knowledge";

describe("@atlas-kb/schema knowledge contracts", () => {
  it("rejects blank search queries", () => {
    const result = SearchKnowledgeRequestSchema.safeParse({
      query: "   ",
      collectionId: "research",
    });

    expect(result.success).toBeFalse();
  });

  it("parses collections response envelopes", () => {
    const payload = success({
      collections: [
        {
          id: "writing-system",
          name: "写作系统",
          description: "写作方法、素材和表达风格",
          color: "#0f766e",
          icon: "i-lucide-pen-tool",
          isPinned: true,
          documentCount: 3,
          readyDocumentCount: 3,
          processingDocumentCount: 0,
          failedDocumentCount: 0,
          createdAt: "2026-03-23T10:00:00.000Z",
          updatedAt: "2026-03-23T10:00:00.000Z",
          lastActivityAt: "2026-03-23T10:00:00.000Z",
        },
      ],
    });

    const result = KnowledgeCollectionsResponseSchema.parse(payload);

    expect(result.data.collections).toHaveLength(1);
    expect(result.data.collections[0]?.id).toBe("writing-system");
  });

  it("parses synchronous import responses", () => {
    const payload = success({
      collection: {
        id: "research",
        name: "研究资料",
        description: "研究文档",
        color: "#0f766e",
        icon: "i-lucide-library",
        isPinned: false,
        documentCount: 1,
        readyDocumentCount: 1,
        processingDocumentCount: 0,
        failedDocumentCount: 0,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
        lastActivityAt: "2026-03-23T10:00:00.000Z",
      },
      source: {
        id: "source-1",
        documentId: "客户访谈纪要.txt",
        collectionId: "research",
        title: "客户访谈纪要",
        summary: "关于目标用户痛点的整理",
        excerpt: "关于目标用户痛点的整理",
        contentPreview: "用户认为最难的是把碎片知识变成行动。",
        content: "用户认为最难的是把碎片知识变成行动。",
        tags: ["research"],
        sourceType: "text",
        status: "ready",
        latestVersion: 1,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
      },
      engine: "hybrid",
      indexed: true,
    });

    const result = KnowledgeImportResponseSchema.parse(payload);

    expect(result.data.source.documentId).toBe("客户访谈纪要.txt");
    expect(result.data.indexed).toBeTrue();
  });

  it("parses batch import responses without job metadata", () => {
    const payload = success({
      collection: {
        id: "research",
        name: "研究资料",
        description: "研究文档",
        color: "#0f766e",
        icon: "i-lucide-library",
        isPinned: false,
        documentCount: 2,
        readyDocumentCount: 1,
        processingDocumentCount: 0,
        failedDocumentCount: 1,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
        lastActivityAt: "2026-03-23T10:00:00.000Z",
      },
      results: [
        {
          fileName: "访谈纪要.md",
          mimeType: "text/markdown",
          byteSize: 4096,
          accepted: true,
          source: {
            id: "source-1",
            documentId: "访谈纪要.md",
            collectionId: "research",
            title: "访谈纪要",
            summary: "关于目标用户痛点的整理",
            excerpt: "关于目标用户痛点的整理",
            contentPreview: "用户认为最难的是把碎片知识变成行动。",
            content: "用户认为最难的是把碎片知识变成行动。",
            tags: ["research"],
            sourceType: "file",
            status: "ready",
            sourceFilename: "访谈纪要.md",
            mimeType: "text/markdown",
            byteSize: 4096,
            latestVersion: 1,
            createdAt: "2026-03-23T10:00:00.000Z",
            updatedAt: "2026-03-23T10:00:00.000Z",
          },
        },
        {
          fileName: "预算表.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          byteSize: 8192,
          accepted: false,
          errorMessage: "当前文件包含二进制内容，暂不支持直接导入",
        },
      ],
      totalCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
    });

    const result = KnowledgeBatchImportResponseSchema.parse(payload);

    expect(result.data.acceptedCount).toBe(1);
    expect(result.data.results[1]?.accepted).toBeFalse();
  });

  it("parses chat reply envelopes with citations", () => {
    const payload = success({
      session: {
        id: "session-1",
        title: "如何整理研究资料",
        collectionId: "research",
        preview: "请基于研究资料给我一个总结",
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
        lastMessageAt: "2026-03-23T10:00:00.000Z",
      },
      userMessage: {
        id: "msg-user",
        sessionId: "session-1",
        role: "user",
        content: "请基于研究资料给我一个总结",
        citations: [],
        createdAt: "2026-03-23T10:00:00.000Z",
      },
      assistantMessage: {
        id: "msg-assistant",
        sessionId: "session-1",
        role: "assistant",
        content: "可以先按主题拆分，再形成行动项。",
        citations: [
          {
            sourceId: "source-1",
            documentId: "客户访谈纪要.txt",
            collectionId: "research",
            title: "客户访谈纪要",
            snippet: "用户认为最难的是把碎片知识变成行动。",
            sourceType: "text",
          },
        ],
        createdAt: "2026-03-23T10:00:01.000Z",
      },
    });

    const result = ChatReplyResponseSchema.parse(payload);

    expect(result.data.assistantMessage.citations[0]?.collectionId).toBe(
      "research",
    );
  });

  it("parses stream completion events", () => {
    const event = ChatReplyStreamDataEventSchema.parse({
      type: "reply-completed",
      session: {
        id: "session-1",
        title: "如何整理研究资料",
        collectionId: "research",
        preview: "请基于研究资料给我一个总结",
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:01.000Z",
        lastMessageAt: "2026-03-23T10:00:01.000Z",
      },
      userMessage: {
        id: "msg-user",
        sessionId: "session-1",
        role: "user",
        content: "请基于研究资料给我一个总结",
        citations: [],
        createdAt: "2026-03-23T10:00:00.000Z",
      },
      assistantMessage: {
        id: "msg-assistant",
        sessionId: "session-1",
        role: "assistant",
        content: "可以先按主题拆分，再形成行动项。",
        citations: [],
        createdAt: "2026-03-23T10:00:01.000Z",
      },
    });

    expect(event.type).toBe("reply-completed");
  });
});
