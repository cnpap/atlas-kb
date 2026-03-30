<script setup lang="ts">
  import type {
    BriefingExport,
    BriefingField,
    BriefingForm,
    BriefingOpinion,
    KnowledgeSource,
  } from "@atlas-kb/schema";
  import { computed, reactive, watch } from "vue";
  import {
    Download,
    FileText,
    LoaderCircle,
    RefreshCw,
    Save,
  } from "lucide-vue-next";
  import { formatDateTime } from "@/lib/knowledge-ui";

  const props = defineProps<{
    briefing: BriefingOpinion | null;
    history: BriefingExport[];
    loading?: boolean;
    open: boolean;
    pending?: boolean;
    source: KnowledgeSource | null;
  }>();

  const emit = defineEmits<{
    downloadHistory: [item: BriefingExport];
    refresh: [];
    submit: [
      payload: { citations: BriefingExport["citations"]; form: BriefingForm },
    ];
    "update:open": [value: boolean];
  }>();

  const form = reactive<BriefingForm>({
    sourceOrg: "",
    documentCode: "",
    documentTitle: "",
    receivedAt: "",
    briefingOpinion: "",
    pendingQuestions: "",
  });

  const fieldOrder = [
    {
      description: "来文或发文单位名称",
      key: "sourceOrg",
      label: "来文单位",
      multiline: false,
    },
    {
      description: "文号或文件编号",
      key: "documentCode",
      label: "文号",
      multiline: false,
    },
    {
      description: "文件标题",
      key: "documentTitle",
      label: "文件标题",
      multiline: false,
    },
    {
      description: "收文日期或时间",
      key: "receivedAt",
      label: "收文时间",
      multiline: false,
    },
    {
      description: "生成的拟办意见正文",
      key: "briefingOpinion",
      label: "拟办意见",
      multiline: true,
    },
    {
      description: "仍待确认的问题",
      key: "pendingQuestions",
      label: "待补充事项",
      multiline: true,
    },
  ] as const;

  function syncForm(briefing: BriefingOpinion | null) {
    form.sourceOrg = briefing?.form.sourceOrg || "";
    form.documentCode = briefing?.form.documentCode || "";
    form.documentTitle = briefing?.form.documentTitle || "";
    form.receivedAt = briefing?.form.receivedAt || "";
    form.briefingOpinion = briefing?.form.briefingOpinion || "";
    form.pendingQuestions = briefing?.form.pendingQuestions || "";
  }

  watch(
    () => [props.briefing, props.open] as const,
    ([briefing, isOpen]) => {
      if (!isOpen) {
        return;
      }

      syncForm(briefing);
    },
    { immediate: true },
  );

  const fieldMap = computed(() => {
    return (props.briefing?.fields ?? []).reduce(
      (map, field) => map.set(field.key, field),
      new Map<BriefingField["key"], BriefingField>(),
    );
  });

  const orderedFields = computed(() =>
    fieldOrder.map((item) => ({
      ...item,
      meta: fieldMap.value.get(item.key) as BriefingField | undefined,
    })),
  );

  const canSubmit = computed(
    () => Boolean(props.briefing) && !props.loading && !props.pending,
  );

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }

  function submit() {
    if (!props.briefing) {
      return;
    }

    emit("submit", {
      form: {
        sourceOrg: form.sourceOrg.trim(),
        documentCode: form.documentCode.trim(),
        documentTitle: form.documentTitle.trim(),
        receivedAt: form.receivedAt.trim(),
        briefingOpinion: form.briefingOpinion.trim(),
        pendingQuestions: form.pendingQuestions.trim(),
      },
      citations: props.briefing.citations,
    });
  }
</script>

<template>
  <UModal
    :open="open"
    :close="!pending"
    :title="source ? `拟办意见 · ${source.title}` : '拟办意见'"
    description="点击右侧文件后直接生成表单，确认后会写入导出历史并下载 JSON。"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-5 py-2">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <LoaderCircle class="size-6 animate-spin text-[var(--accent)]" />
        </div>

        <template v-else-if="briefing">
          <div
            class="rounded-[10px] border border-[var(--border-soft)] bg-white px-4 py-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-[var(--text-strong)]">
                  {{ briefing.title || source?.title }}
                </p>
                <p class="mt-1 text-[11px] text-[var(--text-muted)]">
                  {{ briefing.summary || "已根据当前文件生成拟办意见草稿。" }}
                </p>
              </div>
              <p class="text-[10px] text-[var(--text-dim)]">
                生成时间：{{ formatDateTime(briefing.generatedAt) }}
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div
              v-for="field in orderedFields"
              :key="field.key"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="section-label">{{ field.label }}</p>
                <span
                  class="status-pill scale-90 origin-right"
                  :class="field.meta?.status === 'missing' ? 'failed' : 'ready'"
                >
                  {{ field.meta?.status === "missing" ? "待补充" : "已确认" }}
                </span>
              </div>
              <p class="text-[10px] text-[var(--text-dim)]">
                {{ field.description }}
              </p>
              <textarea
                v-if="field.multiline"
                v-model="form[field.key]"
                class="field-shell w-full text-sm !min-h-[140px] leading-6"
              />
              <input
                v-else
                v-model="form[field.key]"
                class="field-shell w-full text-sm"
              >
              <p
                v-if="(field.meta?.citations.length ?? 0) > 0"
                class="text-[10px] text-[var(--text-dim)]"
              >
                已关联 {{ field.meta?.citations.length ?? 0 }} 条证据片段
              </p>
            </div>
          </div>

          <div
            class="rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-panel-muted)] px-4 py-3"
          >
            <div class="flex items-center gap-2">
              <FileText class="size-4 text-[var(--accent)]" />
              <p class="text-sm font-bold text-[var(--text-strong)]">
                导出历史
              </p>
            </div>

            <div v-if="history.length === 0" class="pt-3">
              <p class="text-[12px] text-[var(--text-muted)]">
                还没有导出记录。
              </p>
            </div>

            <div v-else class="space-y-2 pt-3">
              <div
                v-for="item in history"
                :key="item.id"
                class="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-soft)] bg-white px-3 py-2"
              >
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-medium text-[var(--text-strong)]"
                  >
                    {{ item.title }}
                  </p>
                  <p class="mt-1 text-[10px] text-[var(--text-dim)]">
                    {{ formatDateTime(item.createdAt) }}
                  </p>
                </div>
                <button
                  class="soft-button !px-2 !py-1.5"
                  type="button"
                  @click="emit('downloadHistory', item)"
                >
                  <Download class="size-3.5" />
                  <span class="text-xs">下载</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="empty-state items-center text-center">
          <FileText class="mb-2 size-8 text-[var(--text-dim)]" />
          <p class="text-sm text-[var(--text-muted)]">
            暂无可展示的拟办意见结果。
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-between gap-2">
        <button
          class="soft-button"
          type="button"
          :disabled="loading || pending"
          @click="emit('refresh')"
        >
          <RefreshCw class="size-4" />
          <span>重新生成</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            class="soft-button"
            type="button"
            :disabled="pending"
            @click="emit('update:open', false)"
          >
            取消
          </button>
          <button
            class="soft-button primary"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            <LoaderCircle v-if="pending" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            <span>确定并导出</span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
