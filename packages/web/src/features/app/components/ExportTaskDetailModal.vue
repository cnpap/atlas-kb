<script setup lang="ts">
  import type {
    KnowledgeExportTaskDetail,
    KnowledgeExportTaskParameters,
  } from "@atlas-kb/schema";
  import { LoaderCircle, Save } from "lucide-vue-next";
  import { computed, reactive, watch } from "vue";

  const props = defineProps<{
    loading?: boolean;
    open: boolean;
    pending?: boolean;
    task: KnowledgeExportTaskDetail | null;
  }>();

  const emit = defineEmits<{
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
    title="导出任务编辑"
    description="在这里修改字段并重新保存。"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-5 py-2">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <LoaderCircle class="size-6 animate-spin text-[var(--accent)]" />
        </div>

        <div v-else-if="task" class="space-y-5">
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

          <div v-if="task.canEdit" class="space-y-4">
            <div
              v-for="field in task.template.fields"
              :key="field.id"
              class="space-y-1.5"
              :data-testid="`export-task-field-${field.name}`"
            >
              <div class="flex items-center justify-between gap-3">
                <p
                  class="min-w-0 truncate text-sm font-semibold text-[var(--text-strong)]"
                >
                  {{ field.label }}
                </p>
                <span class="shrink-0 text-[10px] text-[var(--text-dim)]">
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
