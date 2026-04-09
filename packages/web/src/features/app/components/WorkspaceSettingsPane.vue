<script setup lang="ts">
  import type { AssistantRole, KnowledgeCollection } from "@atlas-kb/schema";
  import { GripVertical, LoaderCircle, Plus } from "lucide-vue-next";
  import { computed, ref, watch } from "vue";
  import AssistantRoleModal from "@/features/app/components/AssistantRoleModal.vue";

  const props = defineProps<{
    activeAssistantRoleId: string;
    activeCollection: KnowledgeCollection | null;
    assistantRoles: AssistantRole[];
    deletingCollection?: boolean;
    deletingRoleId?: string;
    loadingAssistantRoles?: boolean;
    roleSwitchDisabled?: boolean;
    savingCollection?: boolean;
    savingRole?: boolean;
    switchingAssistantRole?: boolean;
  }>();

  const emit = defineEmits<{
    createRole: [body: { name: string; stylePrompt: string }];
    deleteCollection: [];
    deleteRole: [roleId: string];
    reorderRoles: [roleIds: string[]];
    saveCollection: [payload: { description: string; name: string }];
    selectActiveRole: [roleId: string];
    updateRole: [
      payload: {
        body: { name: string; stylePrompt: string };
        roleId: string;
      },
    ];
  }>();

  const collectionName = ref("");
  const collectionDescription = ref("");
  const confirmCollectionDelete = ref(false);
  const confirmRoleDeleteId = ref("");
  const draggingRoleId = ref("");
  const roleModalMode = ref<"create" | "edit">("create");
  const roleModalOpen = ref(false);
  const editingRoleId = ref("");

  const builtinRoles = computed(() =>
    props.assistantRoles.filter((role) => role.isBuiltin),
  );
  const privateRoles = computed(() =>
    props.assistantRoles.filter((role) => !role.isBuiltin),
  );
  const activeRole = computed(
    () =>
      props.assistantRoles.find(
        (role) => role.id === props.activeAssistantRoleId,
      ) || null,
  );
  const editingRole = computed(
    () =>
      props.assistantRoles.find((role) => role.id === editingRoleId.value) ||
      null,
  );
  const roleActionsDisabled = computed(() =>
    Boolean(
      props.loadingAssistantRoles ||
        props.savingRole ||
        props.switchingAssistantRole,
    ),
  );

  watch(
    () => props.activeCollection,
    (collection) => {
      collectionName.value = collection?.name || "";
      collectionDescription.value = collection?.description || "";
      confirmCollectionDelete.value = false;
    },
    { immediate: true },
  );

  watch(
    () => props.assistantRoles,
    (roles) => {
      if (
        confirmRoleDeleteId.value &&
        !roles.some((role) => role.id === confirmRoleDeleteId.value)
      ) {
        confirmRoleDeleteId.value = "";
      }

      if (
        editingRoleId.value &&
        !roles.some((role) => role.id === editingRoleId.value)
      ) {
        editingRoleId.value = "";
        roleModalOpen.value = false;
      }
    },
    { immediate: true },
  );

  function submitCollection() {
    emit("saveCollection", {
      name: collectionName.value.trim(),
      description: collectionDescription.value.trim(),
    });
  }

  function handleActiveRoleChange(event: Event) {
    const roleId = (event.target as HTMLSelectElement).value;

    if (!roleId || roleId === props.activeAssistantRoleId) {
      return;
    }

    emit("selectActiveRole", roleId);
  }

  function applyRole(roleId: string) {
    if (
      roleActionsDisabled.value ||
      !roleId ||
      roleId === props.activeAssistantRoleId
    ) {
      return;
    }

    emit("selectActiveRole", roleId);
  }

  function openCreateRoleModal() {
    confirmRoleDeleteId.value = "";
    editingRoleId.value = "";
    roleModalMode.value = "create";
    roleModalOpen.value = true;
  }

  function openEditRoleModal(role: AssistantRole) {
    if (role.isBuiltin) {
      return;
    }

    confirmRoleDeleteId.value = "";
    editingRoleId.value = role.id;
    roleModalMode.value = "edit";
    roleModalOpen.value = true;
  }

  function closeRoleModal() {
    if (props.savingRole) {
      return;
    }

    roleModalOpen.value = false;
    editingRoleId.value = "";
  }

  function submitRole(payload: { name: string; stylePrompt: string }) {
    if (roleModalMode.value === "create") {
      emit("createRole", payload);
      roleModalOpen.value = false;
      return;
    }

    if (!editingRole.value || editingRole.value.isBuiltin) {
      return;
    }

    emit("updateRole", {
      roleId: editingRole.value.id,
      body: payload,
    });
    roleModalOpen.value = false;
    editingRoleId.value = "";
  }

  function requestRoleDelete(roleId: string) {
    confirmRoleDeleteId.value = roleId;
  }

  function cancelRoleDelete() {
    confirmRoleDeleteId.value = "";
  }

  function handlePrivateRoleDragStart(event: DragEvent, roleId: string) {
    if (roleActionsDisabled.value) {
      event.preventDefault();
      return;
    }

    draggingRoleId.value = roleId;
    confirmRoleDeleteId.value = "";

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", roleId);
    }
  }

  function handlePrivateRoleDrop(targetRoleId: string) {
    if (roleActionsDisabled.value) {
      draggingRoleId.value = "";
      return;
    }

    const sourceRoleId = draggingRoleId.value;
    draggingRoleId.value = "";

    if (!sourceRoleId || sourceRoleId === targetRoleId) {
      return;
    }

    const roleIds = privateRoles.value.map((role) => role.id);
    const sourceIndex = roleIds.indexOf(sourceRoleId);
    const targetIndex = roleIds.indexOf(targetRoleId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextRoleIds = [...roleIds];
    nextRoleIds.splice(sourceIndex, 1);
    nextRoleIds.splice(targetIndex, 0, sourceRoleId);

    if (nextRoleIds.every((roleId, index) => roleId === roleIds[index])) {
      return;
    }

    emit("reorderRoles", nextRoleIds);
  }
</script>

<template>
  <div class="pane-scroll pt-4">
    <section class="pb-6">
      <div>
        <p class="section-label">当前文件夹</p>
        <h3 class="card-heading mt-1 text-sm">文件夹设置</h3>
      </div>

      <div
        v-if="!activeCollection"
        class="mt-4 text-sm leading-6 text-[var(--text-muted)]"
      >
        当前没有选中的资料文件夹。角色管理仍然可以继续使用。
      </div>

      <template v-else>
        <div class="mt-4 space-y-4">
          <div class="space-y-1.5">
            <p class="section-label">文件夹名称</p>
            <input
              v-model="collectionName"
              class="field-shell w-full text-sm"
              type="text"
            >
          </div>

          <div class="space-y-1.5">
            <p class="section-label">文件夹说明</p>
            <textarea
              v-model="collectionDescription"
              class="field-shell min-h-[120px] w-full resize-y text-sm"
            />
          </div>

          <div class="flex justify-end">
            <button
              class="soft-button primary"
              type="button"
              :disabled="savingCollection"
              @click="submitCollection"
            >
              <LoaderCircle
                v-if="savingCollection"
                class="size-4 animate-spin"
              />
              <span>{{ savingCollection ? "保存中" : "保存文件夹设置" }}</span>
            </button>
          </div>
        </div>
      </template>
    </section>

    <section class="border-t border-[rgba(93,72,34,0.08)] py-6">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="section-label">全局角色</p>
          <h3 class="card-heading mt-1 text-sm">角色管理</h3>
        </div>

        <button
          class="soft-button !px-2.5 !py-2"
          type="button"
          :disabled="roleActionsDisabled"
          @click="openCreateRoleModal"
        >
          <Plus class="size-4" />
          <span>新建角色</span>
        </button>
      </div>

      <div class="mt-4 space-y-1.5">
        <p class="section-label">当前激活角色</p>
        <label class="field-shell flex items-center gap-2">
          <select
            class="input-reset bg-transparent text-sm"
            :disabled="
              loadingAssistantRoles ||
              switchingAssistantRole ||
              roleSwitchDisabled ||
              assistantRoles.length === 0
            "
            :value="activeAssistantRoleId"
            @change="handleActiveRoleChange"
          >
            <option v-if="assistantRoles.length === 0" value="">
              {{ loadingAssistantRoles ? "角色加载中" : "暂无可用角色" }}
            </option>
            <option
              v-for="role in assistantRoles"
              :key="role.id"
              :value="role.id"
            >
              {{ role.name }}
            </option>
          </select>
          <LoaderCircle
            v-if="switchingAssistantRole"
            class="size-4 shrink-0 animate-spin text-[var(--text-dim)]"
          />
        </label>
      </div>

      <div class="mt-4 space-y-1.5">
        <p class="section-label">当前角色提示词</p>
        <div
          class="field-shell min-h-[136px] whitespace-pre-wrap text-sm leading-6 text-[var(--text-strong)]"
        >
          {{ (loadingAssistantRoles && assistantRoles.length === 0
              ? "角色加载中..."
              : activeRole?.stylePrompt?.trim()) ||
            "当前角色还没有设置提示词。" }}
        </div>
      </div>

      <div
        v-if="loadingAssistantRoles && assistantRoles.length === 0"
        class="mt-6 text-sm text-[var(--text-muted)]"
      >
        正在加载角色...
      </div>

      <template v-else>
        <div v-if="builtinRoles.length > 0" class="mt-6">
          <p class="section-label">内置角色</p>
          <div
            class="mt-3 overflow-hidden border-y border-[rgba(93,72,34,0.08)]"
          >
            <div
              v-for="role in builtinRoles"
              :key="role.id"
              class="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-[rgba(93,72,34,0.08)] px-3 py-3.5 first:border-none"
              :class="
                role.id === activeAssistantRoleId
                  ? 'bg-[rgba(15,118,110,0.06)]'
                  : 'bg-transparent'
              "
            >
              <GripVertical
                class="size-4 shrink-0 text-[var(--text-dim)] opacity-35"
                aria-hidden="true"
              />

              <div class="min-w-0">
                <p
                  class="min-w-0 truncate text-sm font-semibold text-[var(--text-strong)]"
                >
                  {{ role.name }}
                </p>
              </div>

              <div
                class="flex shrink-0 items-center justify-self-end gap-4 pl-4 text-xs"
              >
                <span
                  v-if="role.id === activeAssistantRoleId"
                  class="text-[var(--accent)]"
                >
                  当前
                </span>
                <button
                  v-else
                  class="cursor-pointer text-[var(--accent)] transition hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  :disabled="roleActionsDisabled"
                  @click="applyRole(role.id)"
                >
                  切换
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <p class="section-label">我的角色</p>
          <div
            v-if="privateRoles.length === 0"
            class="mt-3 text-sm leading-6 text-[var(--text-muted)]"
          >
            还没有私有角色。
          </div>
          <div
            v-else
            class="mt-3 overflow-hidden border-y border-[rgba(93,72,34,0.08)]"
          >
            <template v-for="role in privateRoles" :key="role.id">
              <div
                v-if="confirmRoleDeleteId === role.id"
                class="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 border-t border-[rgba(93,72,34,0.08)] px-3 py-3.5 first:border-none"
              >
                <span class="block size-4 shrink-0" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="text-sm leading-6 text-[var(--text-muted)]">
                    确认删除“{{ role.name }}”？如果它是当前角色，会自动回退到默认角色。
                  </p>
                  <div class="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      class="soft-button"
                      type="button"
                      :disabled="deletingRoleId === role.id"
                      @click="cancelRoleDelete"
                    >
                      取消
                    </button>
                    <button
                      class="soft-button warn"
                      type="button"
                      :disabled="deletingRoleId === role.id"
                      @click="emit('deleteRole', role.id)"
                    >
                      <LoaderCircle
                        v-if="deletingRoleId === role.id"
                        class="size-4 animate-spin"
                      />
                      <span>
                        {{ deletingRoleId === role.id ? "删除中" : "确认删除" }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-[rgba(93,72,34,0.08)] px-3 py-3.5 first:border-none"
                :class="
                  [
                    role.id === activeAssistantRoleId
                      ? 'bg-[rgba(15,118,110,0.06)]'
                      : 'bg-transparent',
                    draggingRoleId === role.id ? 'opacity-60' : '',
                  ]
                "
                draggable="true"
                @dragend="draggingRoleId = ''"
                @dragover.prevent
                @dragstart="handlePrivateRoleDragStart($event, role.id)"
                @drop.prevent="handlePrivateRoleDrop(role.id)"
              >
                <GripVertical
                  class="size-4 cursor-grab text-[var(--text-dim)]"
                />

                <div class="min-w-0">
                  <p
                    class="truncate text-sm font-semibold text-[var(--text-strong)]"
                  >
                    {{ role.name }}
                  </p>
                </div>

                <div
                  class="flex shrink-0 items-center justify-self-end gap-4 pl-4 text-xs"
                >
                  <span
                    v-if="role.id === activeAssistantRoleId"
                    class="text-[var(--accent)]"
                  >
                    当前
                  </span>
                  <button
                    v-else
                    class="cursor-pointer text-[var(--accent)] transition hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    :disabled="roleActionsDisabled"
                    @click="applyRole(role.id)"
                  >
                    切换
                  </button>
                  <button
                    class="cursor-pointer text-[var(--text-muted)] transition hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    :disabled="roleActionsDisabled"
                    @click="openEditRoleModal(role)"
                  >
                    编辑
                  </button>
                  <button
                    class="cursor-pointer text-[var(--rose)] transition hover:text-[var(--rose)]/80 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    :disabled="roleActionsDisabled"
                    @click="requestRoleDelete(role.id)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </section>

    <section
      v-if="activeCollection"
      class="border-t border-[rgba(154,52,18,0.14)] py-6"
    >
      <div>
        <p class="section-label text-[var(--rose)]">危险区域</p>
        <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          删除后当前资料文件夹、文件和会话都会一起移除。
        </p>
      </div>

      <div v-if="!confirmCollectionDelete" class="mt-4">
        <button
          class="soft-button warn"
          type="button"
          :disabled="deletingCollection"
          @click="confirmCollectionDelete = true"
        >
          删除当前资料文件夹
        </button>
      </div>

      <div v-else class="mt-4 space-y-3">
        <p class="text-sm leading-6 text-[var(--text-muted)]">
          确认删除“{{ activeCollection.name }}”？这个操作不可撤销。
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <button
            class="soft-button"
            type="button"
            :disabled="deletingCollection"
            @click="confirmCollectionDelete = false"
          >
            取消
          </button>
          <button
            class="soft-button warn"
            type="button"
            :disabled="deletingCollection"
            @click="emit('deleteCollection')"
          >
            <LoaderCircle
              v-if="deletingCollection"
              class="size-4 animate-spin"
            />
            <span>{{ deletingCollection ? "删除中" : "确认删除" }}</span>
          </button>
        </div>
      </div>
    </section>

    <AssistantRoleModal
      v-model:open="roleModalOpen"
      :mode="roleModalMode"
      :role="editingRole"
      :saving="savingRole"
      @close="closeRoleModal"
      @submit="submitRole"
    />
  </div>
</template>
