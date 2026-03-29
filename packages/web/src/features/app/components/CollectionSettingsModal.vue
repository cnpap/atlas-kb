<script setup lang="ts">
  import type { KnowledgeCollection } from "@atlas-kb/schema";
  import { ref, watch } from "vue";
  import { Check, LoaderCircle, Trash2 } from "lucide-vue-next";

  const props = defineProps<{
    collection: KnowledgeCollection | null;
    open: boolean;
    saving?: boolean;
  }>();

  const emit = defineEmits<{
    delete: [];
    "update:open": [value: boolean];
    submit: [payload: { description: string; name: string }];
  }>();

  const name = ref("");
  const description = ref("");

  watch(
    () => [props.collection, props.open] as const,
    ([collection, isOpen]) => {
      if (!isOpen) {
        return;
      }

      name.value = collection?.name || "";
      description.value = collection?.description || "";
    },
    { immediate: true },
  );

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
    title="资料文件夹设置"
    description="调整当前文件夹名称与说明，它会作为会话和文件的顶层容器。"
    :close="!saving"
    @update:open="updateOpen"
  >
    <template #body>
      <div v-if="collection" class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">文件夹名称</p>
          <input v-model="name" class="field-shell w-full text-sm">
        </div>
        <div class="space-y-1.5">
          <p class="section-label">说明描述</p>
          <textarea
            v-model="description"
            class="field-shell w-full text-sm !min-h-[100px]"
          />
        </div>
        <div class="mt-4 border-t border-red-100 pt-4">
          <p class="section-label mb-2 text-red-600">危险区域</p>
          <button
            class="soft-button warn w-full"
            type="button"
            @click="$emit('delete')"
          >
            <Trash2 class="mr-2 size-4" />
            删除此资料文件夹
          </button>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          class="soft-button"
          type="button"
          @click="emit('update:open', false)"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          :disabled="saving"
          @click="submit"
        >
          <LoaderCircle v-if="saving" class="size-4 animate-spin" />
          <Check v-else class="size-4" />
          <span>保存设置</span>
        </button>
      </div>
    </template>
  </UModal>
</template>
