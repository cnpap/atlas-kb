<script setup lang="ts">
  import type {
    KnowledgeSource,
    KnowledgeTemplateSummary,
  } from "@atlas-kb/schema";
  import { computed, ref, watch } from "vue";

  const props = defineProps<{
    open: boolean;
    pending?: boolean;
    source: KnowledgeSource | null;
    templates: KnowledgeTemplateSummary[];
  }>();

  const emit = defineEmits<{
    submit: [templateId: string];
    "update:open": [value: boolean];
  }>();

  const selectedTemplateId = ref("");

  watch(
    () => [props.open, props.templates] as const,
    ([isOpen, templates]) => {
      if (!isOpen) {
        return;
      }

      if (
        templates.some((template) => template.id === selectedTemplateId.value)
      ) {
        return;
      }

      selectedTemplateId.value = templates[0]?.id || "";
    },
    { immediate: true },
  );

  const canSubmit = computed(
    () => Boolean(selectedTemplateId.value) && !props.pending,
  );

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }

  function submit() {
    if (!selectedTemplateId.value) {
      return;
    }

    emit("submit", selectedTemplateId.value);
  }
</script>

<template>
  <UModal
    :open="open"
    :close="!pending"
    :title="source ? `导出模板 · ${source.sourceFilename}` : '导出模板'"
    description="选择一个模板后，会异步创建导出任务并进入右侧导出列表。"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <p
          v-if="templates.length === 0"
          data-testid="export-template-empty"
          class="text-sm leading-6 text-[var(--text-muted)]"
        >
          当前用户还没有可用模板，请先在管理端分配模板。
        </p>

        <div v-else class="space-y-3">
          <label
            v-for="template in templates"
            :key="template.id"
            class="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--border-soft)] px-3 py-3"
            :class="
              selectedTemplateId === template.id
                ? 'bg-[var(--bg-panel-muted)]'
                : 'bg-white'
            "
            :data-testid="`export-template-option-${template.id}`"
          >
            <input
              v-model="selectedTemplateId"
              :value="template.id"
              class="mt-1"
              type="radio"
            >
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[var(--text-strong)]">
                {{ template.name }}
              </p>
              <p class="mt-1 text-[12px] leading-6 text-[var(--text-muted)]">
                {{ template.sourceFilename }}
              </p>
            </div>
          </label>
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
          取消
        </button>
        <button
          class="soft-button primary !px-3 !py-2"
          data-testid="export-template-submit"
          type="button"
          :disabled="!canSubmit"
          @click="submit"
        >
          导出
        </button>
      </div>
    </template>
  </UModal>
</template>
