<script setup lang="ts">
  import type {
    KnowledgeCollection,
    KnowledgeSource,
    SearchKnowledgeHit,
    SearchKnowledgeResult,
  } from "@atlas-kb/schema";
  import {
    Download,
    FileText,
    FolderPlus,
    Info,
    PencilLine,
    RefreshCw,
    Search,
    Settings,
    Trash2,
    Upload,
  } from "lucide-vue-next";
  import {
    formatRelativeTime,
    getSourceStatusLabel,
    getSourceStatusTone,
  } from "@/lib/knowledge-ui";

  defineProps<{
    activeCollection: KnowledgeCollection | null;
    extraHits: SearchKnowledgeHit[];
    filteredSources: KnowledgeSource[];
    loadingSources?: boolean;
    panel: "citations" | "library";
    retrieval: SearchKnowledgeResult | null;
    sourceActionId: string;
    sourceFilter: string;
    usedHits: SearchKnowledgeHit[];
  }>();

  defineEmits<{
    deleteSource: [source: KnowledgeSource];
    downloadSource: [source: KnowledgeSource];
    editSource: [source: KnowledgeSource];
    focusHit: [hit: SearchKnowledgeHit];
    openBriefing: [source: KnowledgeSource];
    openImport: [];
    openPanel: [panel: "citations" | "library"];
    openSettings: [];
    reprocessSource: [source: KnowledgeSource];
    "update:sourceFilter": [value: string];
  }>();
</script>

<template>
  <aside class="workbench-pane right-pane">
    <div class="pane-header pane-header-stack">
      <div class="flex w-full items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <Info
            v-if="panel === 'citations'"
            class="size-4 text-[var(--accent)]"
          />
          <FileText v-else class="size-4 text-[var(--accent)]" />
          <p class="text-sm font-bold text-[var(--text-strong)]">
            {{ panel === "citations" ? "引用溯源" : "当前文件夹资料" }}
          </p>
        </div>

        <div class="segmented-tabs !bg-transparent !border-none !p-0 gap-2">
          <button
            class="soft-button"
            :class="panel === 'citations' ? 'primary' : ''"
            type="button"
            @click="$emit('openPanel', 'citations')"
          >
            引用
          </button>
          <button
            class="soft-button"
            :class="panel === 'library' ? 'primary' : ''"
            type="button"
            @click="$emit('openPanel', 'library')"
          >
            文件夹
          </button>
        </div>
      </div>
    </div>

    <div v-if="panel === 'citations'" class="pane-scroll pt-4">
      <div v-if="!retrieval" class="empty-state items-center text-center">
        <Search class="mb-2 size-8 text-[var(--text-dim)]" />
        <p class="text-sm text-[var(--text-muted)]">等待查询激发引用...</p>
      </div>

      <template v-else>
        <div class="mb-6">
          <div class="section-row mb-3">
            <span class="section-label">检索摘要</span>
          </div>
          <div class="panel-muted border border-[var(--border-soft)] p-4">
            <p class="text-[13px] leading-relaxed">
              本轮命中了
              <span class="font-bold text-[var(--accent)]"
                >{{ retrieval.total }}</span
              >
              条记录，其中
              <span class="font-bold text-[var(--accent)]"
                >{{ usedHits.length }}</span
              >
              条被核心引用。
            </p>
            <div class="mt-3 flex flex-wrap gap-1">
              <span
                v-for="variant in retrieval.queryVariants"
                :key="variant"
                class="rounded bg-[var(--bg-canvas-strong)] px-1.5 py-0.5 text-[10px]"
              >
                {{ variant }}
              </span>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div>
            <p class="section-label mb-3">核心引用片段</p>
            <div class="stack-list">
              <button
                v-for="hit in usedHits"
                :key="hit.chunkId"
                class="w-full rounded-[10px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,251,244,0.68)] px-3 py-3 text-left transition hover:border-[var(--border-base)] hover:bg-[rgba(255,252,247,0.9)]"
                type="button"
                @click="$emit('focusHit', hit)"
              >
                <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <p
                      class="line-clamp-2 text-sm font-bold leading-5 text-[var(--text-strong)] break-words"
                    >
                      {{ hit.title }}
                    </p>
                    <p
                      class="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--text-muted)]"
                    >
                      "...{{ hit.snippet }}..."
                    </p>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <span class="status-pill ready scale-90 origin-left"
                        >已采用</span
                      >
                      <p class="text-[10px] text-[var(--text-dim)]">
                        {{ hit.sourceType }}
                      </p>
                      <p
                        v-if="hit.sectionPath || hit.sourceFilename"
                        class="text-[10px] text-[var(--text-dim)]"
                      >
                        {{ hit.sectionPath || hit.sourceFilename }}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div v-if="extraHits.length > 0">
            <p class="section-label mb-3">补充召回结果</p>
            <div class="stack-list">
              <button
                v-for="hit in extraHits"
                :key="hit.chunkId"
                class="stack-item cursor-pointer !bg-[var(--bg-panel-muted)] !p-3 text-left opacity-80"
                type="button"
                @click="$emit('focusHit', hit)"
              >
                <p class="text-[12px] font-medium">{{ hit.title }}</p>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-else class="pane-scroll flex flex-col pt-4">
      <div
        class="mb-4 flex items-center gap-2 border-b border-[rgba(93,72,34,0.08)] pb-4"
      >
        <button
          class="soft-button !px-2.5 !py-1.5"
          type="button"
          :disabled="!activeCollection"
          @click="$emit('openImport')"
        >
          <Upload class="size-3.5" />
          <span class="text-xs">添加文件</span>
        </button>
        <button
          class="soft-button !px-2.5 !py-1.5"
          type="button"
          :disabled="!activeCollection"
          @click="$emit('openSettings')"
        >
          <Settings class="size-3.5" />
          <span class="text-xs">设置</span>
        </button>
      </div>

      <div
        v-if="!activeCollection"
        class="empty-state items-center text-center"
      >
        <FolderPlus class="mb-2 size-8 text-[var(--text-dim)]" />
        <p class="text-sm text-[var(--text-muted)]">请先在左侧选择一个文件夹</p>
      </div>

      <template v-else>
        <div class="relative mb-4">
          <Search
            class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-dim)]"
          />
          <input
            :model-value="sourceFilter"
            class="field-shell w-full !py-2 !pl-9 text-sm"
            placeholder="搜索资料..."
            @input="$emit('update:sourceFilter', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div v-if="loadingSources" class="stack-list">
          <div
            v-for="i in 6"
            :key="i"
            class="stack-item h-16 animate-pulse opacity-50"
          />
        </div>

        <div v-else class="stack-list">
          <div
            v-for="source in filteredSources"
            :key="source.id"
            class="rounded-[10px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,251,244,0.68)] px-3 py-3"
          >
            <button
              class="w-full text-left"
              type="button"
              :disabled="source.status !== 'ready' || sourceActionId === source.id"
              @click="$emit('openBriefing', source)"
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p
                    class="line-clamp-2 text-sm font-bold leading-5 text-[var(--text-strong)] break-words"
                  >
                    {{ source.title }}
                  </p>
                  <p
                    class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
                  >
                    {{ source.summary || "暂无摘要。" }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      class="status-pill scale-90 origin-left"
                      :class="getSourceStatusTone(source.status)"
                    >
                      {{ getSourceStatusLabel(source.status) }}
                    </span>
                    <p class="text-[10px] text-[var(--text-dim)]">
                      {{ formatRelativeTime(source.updatedAt) }}
                    </p>
                    <p class="text-[10px] text-[var(--accent)]">
                      {{ source.status === "ready"
                          ? "点击生成拟办意见"
                          : "处理完成后可生成拟办意见" }}
                    </p>
                  </div>
                </div>
              </div>
            </button>

            <div
              class="mt-3 flex items-center gap-2 border-t border-[rgba(93,72,34,0.06)] pt-3"
            >
              <button
                class="soft-button !p-1.5"
                title="编辑"
                type="button"
                @click.stop="$emit('editSource', source)"
              >
                <PencilLine class="size-3.5" />
              </button>
              <button
                class="soft-button !p-1.5"
                title="下载"
                type="button"
                @click.stop="$emit('downloadSource', source)"
              >
                <Download class="size-3.5" />
              </button>
              <button
                class="soft-button !p-1.5"
                title="重处理"
                type="button"
                :disabled="sourceActionId === source.id"
                @click.stop="$emit('reprocessSource', source)"
              >
                <RefreshCw
                  class="size-3.5"
                  :class="sourceActionId === source.id ? 'animate-spin' : ''"
                />
              </button>
              <div class="flex-1" />
              <button
                class="soft-button warn !p-1.5"
                title="删除"
                type="button"
                :disabled="sourceActionId === source.id"
                @click.stop="$emit('deleteSource', source)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
