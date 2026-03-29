<script setup lang="ts">
  import { computed } from "vue";
  import { LoaderCircle, LogOut, UserRound } from "lucide-vue-next";

  const props = defineProps<{
    loading?: boolean;
    username?: string;
  }>();

  defineEmits<{
    logout: [];
  }>();

  const initials = computed(
    () => props.username?.trim().slice(0, 1).toUpperCase() || "?",
  );
</script>

<template>
  <div class="border-t border-[rgba(93,72,34,0.08)] px-4 py-4">
    <div class="flex items-center gap-3">
      <div
        class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]"
      >
        <LoaderCircle v-if="loading" class="size-4 animate-spin" />
        <span v-else>{{ initials }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs text-[var(--text-dim)]">当前用户</p>
        <p class="truncate text-sm font-semibold text-[var(--text-strong)]">
          <span v-if="loading">加载中...</span>
          <span v-else-if="username">{{ username }}</span>
          <span v-else>未登录</span>
        </p>
      </div>
    </div>

    <button
      class="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border-soft)] bg-[rgba(255,251,244,0.82)] px-3 py-2 text-sm text-[var(--text-strong)] transition hover:-translate-y-0.5 hover:border-[rgba(15,118,110,0.26)] hover:bg-[rgba(15,118,110,0.08)] hover:shadow-[0_10px_20px_rgba(55,34,10,0.08)]"
      type="button"
      @click="$emit('logout')"
    >
      <UserRound class="size-4" />
      <span class="flex-1 text-left">退出登录</span>
      <LogOut class="size-4" />
    </button>
  </div>
</template>
