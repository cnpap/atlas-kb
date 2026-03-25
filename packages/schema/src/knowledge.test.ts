import { describe, expect, it } from "bun:test";
import { success } from "./api";
import {
  ChatReplyStreamDataEventSchema,
  KnowledgeBatchImportResponseSchema,
  ChatReplyResponseSchema,
  KnowledgeCollectionsResponseSchema,
  KnowledgeImportResponseSchema,
  SearchKnowledgeRequestSchema,
} from "./knowledge";

describe("@atlas-kb/schema knowledge contracts", () => {
  it("rejects blank search queries", () => {
    const result = SearchKnowledgeRequestSchema.safeParse({
      query: "   ",
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

  it("parses import responses with job metadata", () => {
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
        collectionId: "research",
        spaceId: "research",
        title: "客户访谈纪要",
        summary: "关于目标用户痛点的整理",
        excerpt: "关于目标用户痛点的整理",
        contentPreview: "用户认为最难的是把碎片知识变成行动。",
        content: "用户认为最难的是把碎片知识变成行动。",
        tags: ["research"],
        sourceType: "text",
        source: "upload",
        status: "ready",
        latestVersion: 1,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
      },
      job: {
        id: "job-1",
        sourceId: "source-1",
        collectionId: "research",
        sourceType: "text",
        stage: "completed",
        status: "ready",
        attempt: 1,
        startedAt: "2026-03-23T10:00:00.000Z",
        finishedAt: "2026-03-23T10:00:10.000Z",
      },
      engine: "lexical",
      indexed: false,
    });

    const result = KnowledgeImportResponseSchema.parse(payload);

    expect(result.data.source.title).toBe("客户访谈纪要");
    expect(result.data.job.stage).toBe("completed");
  });

  it("parses batch import responses with accepted and rejected files", () => {
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
          fileName: "访谈纪要.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteSize: 4096,
          accepted: true,
          source: {
            id: "source-1",
            collectionId: "research",
            spaceId: "research",
            title: "访谈纪要",
            summary: "关于目标用户痛点的整理",
            excerpt: "关于目标用户痛点的整理",
            contentPreview: "用户认为最难的是把碎片知识变成行动。",
            content: "用户认为最难的是把碎片知识变成行动。",
            tags: ["research"],
            sourceType: "file",
            source: "upload",
            status: "ready",
            sourceFilename: "访谈纪要.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            byteSize: 4096,
            latestVersion: 1,
            createdAt: "2026-03-23T10:00:00.000Z",
            updatedAt: "2026-03-23T10:00:00.000Z",
          },
          job: {
            id: "job-1",
            sourceId: "source-1",
            collectionId: "research",
            sourceType: "file",
            stage: "queued",
            status: "processing",
            attempt: 1,
            startedAt: "2026-03-23T10:00:00.000Z",
          },
        },
        {
          fileName: "预算表.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          byteSize: 8192,
          accepted: false,
          errorMessage: "Unsupported file type.",
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
            documentId: "source-1",
            collectionId: "research",
            spaceId: "research",
            title: "客户访谈纪要",
            snippet: "用户认为最难的是把碎片知识变成行动。",
            sourceType: "text",
          },
        ],
        createdAt: "2026-03-23T10:00:01.000Z",
      },
      search: {
        query: "请基于研究资料给我一个总结",
        rewrittenQueries: ["请基于研究资料给我一个总结"],
        queryVariants: ["请基于研究资料给我一个总结"],
        engine: "lexical",
        total: 1,
        usedHitIds: ["source-1:0"],
        hits: [
          {
            sourceId: "source-1",
            documentId: "source-1",
            collectionId: "research",
            spaceId: "research",
            chunkId: "source-1:0",
            title: "客户访谈纪要",
            summary: "关于目标用户痛点的整理",
            snippet: "用户认为最难的是把碎片知识变成行动。",
            sourceType: "text",
            tags: ["research"],
            score: 1,
            strategy: "lexical",
            usedInAnswer: true,
            recallPaths: ["关键词召回", "重排"],
          },
        ],
      },
      retrieval: {
        query: "请基于研究资料给我一个总结",
        rewrittenQueries: ["请基于研究资料给我一个总结"],
        queryVariants: ["请基于研究资料给我一个总结"],
        engine: "lexical",
        total: 1,
        usedHitIds: ["source-1:0"],
        hits: [
          {
            sourceId: "source-1",
            documentId: "source-1",
            collectionId: "research",
            spaceId: "research",
            chunkId: "source-1:0",
            title: "客户访谈纪要",
            summary: "关于目标用户痛点的整理",
            snippet: "用户认为最难的是把碎片知识变成行动。",
            sourceType: "text",
            tags: ["research"],
            score: 1,
            strategy: "lexical",
            usedInAnswer: true,
            recallPaths: ["关键词召回", "重排"],
          },
        ],
      },
    });

    const result = ChatReplyResponseSchema.parse(payload);

    expect(result.data.assistantMessage.citations[0]?.title).toBe(
      "客户访谈纪要",
    );
    expect(result.data.search.total).toBe(1);
    expect(result.data.retrieval.usedHitIds).toEqual(["source-1:0"]);
  });

  it("parses chat stream data events", () => {
    const traceEvent = {
      id: "trace-1",
      kind: "search" as const,
      state: "completed" as const,
      title: "命中 3 条资料",
      detail: "已完成知识库检索。",
      createdAt: "2026-03-23T10:00:01.000Z",
    };

    const accepted = ChatReplyStreamDataEventSchema.parse({
      type: "reply-accepted",
      userMessage: {
        id: "msg-user",
        sessionId: "session-1",
        role: "user",
        content: "给我一个总结",
        citations: [],
        createdAt: "2026-03-23T10:00:00.000Z",
      },
    });
    const trace = ChatReplyStreamDataEventSchema.parse({
      type: "trace",
      event: traceEvent,
    });
    const completed = ChatReplyStreamDataEventSchema.parse({
      type: "reply-completed",
      session: {
        id: "session-1",
        title: "产品策略讨论",
        preview: "给我一个总结",
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:01.000Z",
        lastMessageAt: "2026-03-23T10:00:01.000Z",
      },
      userMessage: {
        id: "msg-user",
        sessionId: "session-1",
        role: "user",
        content: "给我一个总结",
        citations: [],
        createdAt: "2026-03-23T10:00:00.000Z",
      },
      assistantMessage: {
        id: "msg-assistant",
        sessionId: "session-1",
        role: "assistant",
        content: "先按主题拆分，再形成行动项。",
        citations: [],
        retrieval: {
          query: "给我一个总结",
          rewrittenQueries: ["给我一个总结"],
          queryVariants: ["给我一个总结"],
          engine: "lexical",
          total: 1,
          usedHitIds: [],
          hits: [],
        },
        trace: [traceEvent],
        createdAt: "2026-03-23T10:00:01.000Z",
      },
      retrieval: {
        query: "给我一个总结",
        rewrittenQueries: ["给我一个总结"],
        queryVariants: ["给我一个总结"],
        engine: "lexical",
        total: 1,
        usedHitIds: [],
        hits: [],
      },
      search: {
        query: "给我一个总结",
        rewrittenQueries: ["给我一个总结"],
        queryVariants: ["给我一个总结"],
        engine: "lexical",
        total: 1,
        usedHitIds: [],
        hits: [],
      },
    });

    expect(accepted.type).toBe("reply-accepted");
    expect(trace.event.title).toBe("命中 3 条资料");
    expect(completed.assistantMessage.trace?.[0]?.kind).toBe("search");
  });
});
