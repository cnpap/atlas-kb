<script setup lang="ts">
  import { ref, watch } from "vue";
  import { Check, LoaderCircle } from "lucide-vue-next";

  const props = defineProps<{
    creating?: boolean;
    open: boolean;
  }>();

  const emit = defineEmits<{
    close: [];
    submit: [payload: { description: string; name: string }];
    "update:open": [value: boolean];
  }>();

  const name = ref("");
  const description = ref("");

  watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) {
        name.value = "";
        description.value = "";
      }
    },
  );

  function closeModal() {
    if (props.creating) {
      return;
    }

    emit("update:open", false);
    emit("close");
  }

  function submit() {
    emit("submit", {
      name: name.value.trim(),
      description: description.value.trim(),
    });
  }

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }
</script>

<template>
  <UModal
    :open="open"
    title="新建资料文件夹"
    description="创建一个顶层资料文件夹，后续上传的文件都会归入这里。"
    :close="!creating"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">文件夹名称</p>
          <input
            v-model="name"
            class="field-shell w-full text-sm"
            placeholder="例如：市场研究、技术文档..."
          >
        </div>
        <div class="space-y-1.5">
          <p class="section-label">文件夹说明</p>
          <textarea
            v-model="description"
            class="field-shell w-full text-sm !min-h-[100px]"
            placeholder="简要说明此分组包含的资料范围..."
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          class="soft-button"
          type="button"
          :disabled="creating"
          @click="closeModal"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          :disabled="creating || !name.trim() || !description.trim()"
          @click="submit"
        >
          <LoaderCircle v-if="creating" class="size-4 animate-spin" />
          <Check v-else class="size-4" />
          <span>确认创建</span>
        </button>
      </div>
    </template>
  </UModal>
</template>
