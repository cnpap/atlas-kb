<script setup lang="ts">
  import type {
    KnowledgeExportTaskDetail,
    KnowledgeExportTaskParameters,
  } from "@atlas-kb/schema";
  import { computed, reactive, watch } from "vue";
  import { Download, LoaderCircle, Save } from "lucide-vue-next";
  import {
    formatDateTime,
    getExportTaskStatusLabel,
    getExportTaskStatusTone,
  } from "@/lib/knowledge-ui";

  const props = defineProps<{
    loading?: boolean;
    open: boolean;
    pending?: boolean;
    task: KnowledgeExportTaskDetail | null;
  }>();

  const emit = defineEmits<{
    download: [task: KnowledgeExportTaskDetail];
    submit: [parameters: KnowledgeExportTaskParameters];
    "update:open": [value: boolean];
  }>();

  const form = reactive<Record<string, string>>({});

  function syncForm(task: KnowledgeExportTaskDetail | null) {
    const nextEntries = Object.entries(task?.parameters ?? {});
    const nextKeys = new Set(nextEntries.map(([key]) => key));

    for (const key of Object.keys(form)) {
      if (!nextKeys.has(key)) {
        delete form[key];
      }
    }

    for (const [key, value] of nextEntries) {
      form[key] = value;
    }
  }

  watch(
    () => [props.open, props.task] as const,
    ([isOpen, task]) => {
      if (!isOpen) {
        return;
      }

      syncForm(task);
    },
    { immediate: true },
  );

  const canSave = computed(
    () =>
      Boolean(props.task?.canEdit) &&
      !props.loading &&
      !props.pending &&
      Boolean(props.task?.template.fields.length),
  );

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }

  function submit() {
    if (!props.task) {
      return;
    }

    const parameters = Object.fromEntries(
      props.task.template.fields.map((field) => [
        field.name,
        form[field.name] ?? "",
      ]),
    );

    emit("submit", parameters);
  }
</script>

<template>
  <UModal
    :open="open"
    :close="!pending"
    :title="task ? `${task.templateName} · ${task.sourceTitle}` : '导出任务详情'"
    description="导出完成后可以在这里查看结果、修改字段并重新保存。"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-5 py-2">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <LoaderCircle class="size-6 animate-spin text-[var(--accent)]" />
        </div>

        <div v-else-if="task" class="space-y-5">
          <div
            class="rounded-[8px] border border-[var(--border-soft)] bg-[var(--bg-panel-muted)] px-4 py-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-[var(--text-strong)]">
                  {{ task.sourceTitle }}
                </p>
                <p class="mt-1 text-[12px] text-[var(--text-muted)]">
                  {{ task.templateName }}
                </p>
              </div>
              <span
                class="status-pill"
                :class="getExportTaskStatusTone(task.status)"
              >
                {{ getExportTaskStatusLabel(task.status) }}
              </span>
            </div>
            <p class="mt-2 text-[10px] text-[var(--text-dim)]">
              更新时间：{{ formatDateTime(task.updatedAt) }}
            </p>
            <p
              v-if="task.failureMessage"
              class="mt-2 text-[12px] text-[var(--danger)]"
            >
              {{ task.failureMessage }}
            </p>
          </div>

          <div
            v-if="task.exportFile"
            data-testid="export-task-result"
            class="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-soft)] bg-white px-4 py-3"
          >
            <div class="min-w-0">
              <p
                class="truncate text-sm font-semibold text-[var(--text-strong)]"
              >
                {{ task.exportFile.outputFilename }}
              </p>
              <p class="mt-1 text-[10px] text-[var(--text-dim)]">
                生成时间：{{ formatDateTime(task.exportFile.createdAt) }}
              </p>
            </div>
            <button
              class="soft-button !px-3 !py-2"
              type="button"
              @click="$emit('download', task)"
            >
              <Download class="size-4" />
              <span class="text-xs">查看结果</span>
            </button>
          </div>

          <p
            v-if="!task.canEdit"
            class="text-sm leading-6 text-[var(--text-muted)]"
          >
            当前任务还没有可编辑结果，请等待导出完成后再查看详情。
          </p>

          <div v-else class="space-y-4">
            <div
              v-for="field in task.template.fields"
              :key="field.id"
              class="space-y-1.5"
              :data-testid="`export-task-field-${field.name}`"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-[var(--text-strong)]">
                  {{ field.label }}
                </p>
                <span class="text-[10px] text-[var(--text-dim)]">
                  {{ field.name }}
                </span>
              </div>
              <p
                v-if="field.description"
                class="text-[10px] text-[var(--text-dim)]"
              >
                {{ field.description }}
              </p>
              <textarea
                v-model="form[field.name]"
                class="field-shell min-h-[110px] w-full text-sm leading-6"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <button
          class="soft-button !px-3 !py-2"
          type="button"
          :disabled="pending"
          @click="updateOpen(false)"
        >
          关闭
        </button>
        <button
          class="soft-button primary !px-3 !py-2"
          data-testid="export-task-save"
          type="button"
          :disabled="!canSave"
          @click="submit"
        >
          <Save class="size-4" />
          <span>保存</span>
        </button>
      </div>
    </template>
  </UModal>
</template>
