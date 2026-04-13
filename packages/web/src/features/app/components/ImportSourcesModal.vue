<script setup lang="ts">
  import { computed, ref, watch } from "vue";
  import { Check, LoaderCircle, Trash2, Upload } from "lucide-vue-next";
  import { formatFileSize } from "@/lib/knowledge-ui";

  type ImportMode = "file" | "text";

  const props = defineProps<{
    open: boolean;
    pending?: boolean;
  }>();

  const emit = defineEmits<{
    "submit:file": [payload: { files: File[] }];
    "submit:text": [
      payload: {
        content: string;
        sourceFilename?: string;
      },
    ];
    "update:open": [value: boolean];
  }>();

  const mode = ref<ImportMode>("file");
  const queuedFiles = ref<File[]>([]);
  const textSourceFilename = ref("");
  const textContent = ref("");

  const canSubmit = computed(() => {
    if (props.pending) {
      return false;
    }

    if (mode.value === "file") {
      return queuedFiles.value.length > 0;
    }

    return Boolean(textContent.value.trim());
  });

  watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        return;
      }

      mode.value = "file";
      queuedFiles.value = [];
      textSourceFilename.value = "";
      textContent.value = "";
    },
  );

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);

    if (files.length > 0) {
      queuedFiles.value = [...queuedFiles.value, ...files];
    }

    if (input) {
      input.value = "";
    }
  }

  function removeFile(index: number) {
    queuedFiles.value = queuedFiles.value.filter(
      (_, currentIndex) => currentIndex !== index,
    );
  }

  function submit() {
    if (mode.value === "file") {
      emit("submit:file", {
        files: queuedFiles.value,
      });
      return;
    }

    emit("submit:text", {
      sourceFilename: textSourceFilename.value.trim() || undefined,
      content: textContent.value.trim(),
    });
  }

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }
</script>

<template>
  <UModal
    :open="open"
    title="添加文件到当前分组"
    description="支持批量上传 PDF、Word、Excel、文本或代码文件，也支持直接录入文本资料。"
    :close="!pending"
    @update:open="updateOpen"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="segmented-tabs w-full">
          <button
            class="segmented-tab flex-1"
            :class="mode === 'file' ? 'is-active' : ''"
            type="button"
            @click="mode = 'file'"
          >
            文件上传
          </button>
          <button
            class="segmented-tab flex-1"
            :class="mode === 'text' ? 'is-active' : ''"
            type="button"
            @click="mode = 'text'"
          >
            手动录入
          </button>
        </div>

        <template v-if="mode === 'file'">
          <label
            class="field-shell flex cursor-pointer flex-col items-center justify-center gap-2 py-8 text-center"
            data-testid="import-file-dropzone"
          >
            <Upload class="size-8 text-[var(--text-dim)]" />
            <p class="text-sm font-medium">
              {{ queuedFiles.length > 0 ? `已选择 ${queuedFiles.length} 个文件，可继续添加` : '点击选择多个文件' }}
            </p>
            <p class="text-[10px] text-[var(--text-dim)]">
              支持
              PDF、Word、Excel、Markdown、文本、HTML、JSON、CSV、XML、YAML，以及常见代码文件。
            </p>
            <input
              type="file"
              multiple
              class="hidden"
              data-testid="import-file-input"
              @change="handleFileChange"
            >
          </label>

          <div v-if="queuedFiles.length > 0" class="space-y-2">
            <div
              v-for="(file, index) in queuedFiles"
              :key="`${file.name}:${file.size}:${file.lastModified}:${index}`"
              class="rounded-[10px] border border-[var(--border-soft)] bg-white px-3 py-2"
            >
              <div class="flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-medium text-[var(--text-strong)]"
                  >
                    {{ file.name }}
                  </p>
                  <p class="mt-1 text-[10px] text-[var(--text-dim)]">
                    {{ formatFileSize(file.size) }}
                  </p>
                </div>
                <button
                  class="soft-button !p-1.5"
                  type="button"
                  @click="removeFile(index)"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="space-y-1.5">
            <p class="section-label">文件名</p>
            <input
              v-model="textSourceFilename"
              class="field-shell w-full text-sm"
              placeholder="输入文件名，可不带扩展名"
            >
          </div>
          <div class="space-y-1.5">
            <p class="section-label">正文内容</p>
            <textarea
              v-model="textContent"
              class="field-shell w-full text-sm !min-h-[180px]"
              placeholder="在这里粘贴或输入资料正文..."
            />
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
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
          data-testid="import-submit-button"
          type="button"
          :disabled="!canSubmit"
          @click="submit"
        >
          <LoaderCircle v-if="pending" class="size-4 animate-spin" />
          <Check v-else class="size-4" />
          <span
            >{{ mode === "file" ? `上传 ${queuedFiles.length} 个文件` : "保存文本资料" }}</span
          >
        </button>
      </div>
    </template>
  </UModal>
</template>
