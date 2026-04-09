<script setup lang="ts">
  import type { AssistantRole } from "@atlas-kb/schema";
  import { LoaderCircle } from "lucide-vue-next";
  import { computed, ref, watch } from "vue";

  const props = defineProps<{
    mode: "create" | "edit";
    open: boolean;
    role?: AssistantRole | null;
    saving?: boolean;
  }>();

  const emit = defineEmits<{
    close: [];
    submit: [payload: { name: string; stylePrompt: string }];
    "update:open": [value: boolean];
  }>();

  const name = ref("");
  const stylePrompt = ref("");

  const modalTitle = computed(() =>
    props.mode === "create" ? "新建角色" : "编辑角色",
  );
  const submitLabel = computed(() =>
    props.mode === "create" ? "创建角色" : "保存角色",
  );

  watch(
    () => [props.mode, props.open, props.role] as const,
    ([mode, isOpen, role]) => {
      if (!isOpen) {
        return;
      }

      name.value = mode === "edit" ? role?.name || "" : "";
      stylePrompt.value = mode === "edit" ? role?.stylePrompt || "" : "";
    },
    { immediate: true },
  );

  function closeModal() {
    if (props.saving) {
      return;
    }

    emit("update:open", false);
    emit("close");
  }

  function submit() {
    emit("submit", {
      name: name.value.trim(),
      stylePrompt: stylePrompt.value.trim(),
    });
  }

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }
</script>

<template>
  <UModal
    :open="open"
    :title="modalTitle"
    :close="!saving"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">角色名称</p>
          <input
            v-model="name"
            class="field-shell w-full text-sm"
            data-testid="assistant-role-name"
            placeholder="例如：纪要助手、审校助手"
            type="text"
          >
        </div>

        <div class="space-y-1.5">
          <p class="section-label">回复风格</p>
          <textarea
            v-model="stylePrompt"
            class="field-shell min-h-[180px] w-full resize-y text-sm"
            data-testid="assistant-role-style-prompt"
            placeholder="例如：先给结论，再列关键依据；使用短句；保持正式克制。"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          class="soft-button"
          type="button"
          :disabled="saving"
          @click="closeModal"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          data-testid="assistant-role-submit"
          type="button"
          :disabled="saving || !name.trim()"
          @click="submit"
        >
          <LoaderCircle v-if="saving" class="size-4 animate-spin" />
          <span>{{ submitLabel }}</span>
        </button>
      </div>
    </template>
  </UModal>
</template>
