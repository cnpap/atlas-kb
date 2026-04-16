<script setup lang="ts">
  import type {
    KnowledgeExportProcessTraceItem,
    KnowledgeExportTaskDetail,
  } from "@atlas-kb/schema";
  import { LoaderCircle } from "lucide-vue-next";
  import { computed } from "vue";

  const props = defineProps<{
    loading?: boolean;
    open: boolean;
    task: KnowledgeExportTaskDetail | null;
  }>();

  const emit = defineEmits<{
    "update:open": [value: boolean];
  }>();

  const processTrace = computed(() => props.task?.processTrace ?? []);

  function getTraceStatusClass(
    status: KnowledgeExportProcessTraceItem["status"],
  ) {
    return {
      "border-[rgba(67,126,91,0.34)] bg-[rgba(67,126,91,0.12)] text-[var(--success)]":
        status === "completed",
      "border-[rgba(154,52,18,0.34)] bg-[rgba(154,52,18,0.12)] text-[var(--rose)]":
        status === "failed",
      "border-[rgba(93,72,34,0.18)] bg-[rgba(93,72,34,0.08)] text-[var(--text-muted)]":
        status === "pending",
      "border-[rgba(194,132,46,0.34)] bg-[rgba(194,132,46,0.12)] text-[var(--accent)]":
        status === "running",
    };
  }

  function formatTraceTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }
</script>

<template>
  <UModal
    :open="open"
    title="导出过程"
    description="这里展示可审计的执行过程，不展示模型隐藏思维链。"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-5 py-2">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <LoaderCircle class="size-6 animate-spin text-[var(--accent)]" />
        </div>

        <div v-else-if="task" class="space-y-4">
          <div
            class="min-w-0 rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.65)] px-3 py-2"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <p
                class="min-w-0 truncate text-sm font-semibold text-[var(--text-strong)]"
                :title="task.templateName"
              >
                {{ task.templateName }}
              </p>
              <span class="shrink-0 text-xs text-[var(--text-dim)]">·</span>
              <p
                class="min-w-0 truncate text-sm font-semibold text-[var(--text-strong)]"
                :title="task.sourceFilename"
              >
                {{ task.sourceFilename }}
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="section-label">过程时间线</p>
              <span class="text-[10px] text-[var(--text-dim)]">
                {{ processTrace.length }}
                条记录
              </span>
            </div>

            <div
              v-if="processTrace.length === 0"
              class="rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.55)] px-3 py-4 text-center text-xs text-[var(--text-muted)]"
            >
              暂无过程记录。
            </div>

            <div v-else class="space-y-0">
              <div
                v-for="(item, index) in processTrace"
                :key="item.id"
                class="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-4 last:pb-0"
              >
                <div class="relative flex justify-center">
                  <span
                    v-if="index < processTrace.length - 1"
                    class="absolute top-4 h-full w-px bg-[rgba(93,72,34,0.12)]"
                  />
                  <span
                    class="relative z-10 mt-1 size-3 rounded-full border"
                    :class="getTraceStatusClass(item.status)"
                  />
                </div>

                <div
                  class="min-w-0 rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.58)] px-3 py-2"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <p
                      class="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-strong)]"
                      :title="item.label"
                    >
                      {{ item.label }}
                    </p>
                    <span
                      v-if="item.attempt"
                      class="shrink-0 rounded-full border border-[rgba(93,72,34,0.12)] px-1.5 py-0.5 text-[9px] text-[var(--text-dim)]"
                    >
                      第 {{ item.attempt }} 次
                    </span>
                    <span class="shrink-0 text-[10px] text-[var(--text-dim)]">
                      {{ formatTraceTime(item.createdAt) }}
                    </span>
                  </div>

                  <p
                    v-if="item.path || item.detail"
                    class="mt-1 truncate text-[11px] leading-5 text-[var(--text-muted)]"
                    :title="item.path || item.detail || ''"
                  >
                    {{ item.path || item.detail }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
